import pytest

from app.core.rate_limit import RateLimitMiddleware, SlidingWindowLimiter
from tests.helpers import register_and_login


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_limiter_blocks_after_limit_and_reports_wait():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    key = ("login", "1.1.1.1")

    assert [limiter.hit(key, 3, 60) for _ in range(3)] == [None, None, None]
    clock.now += 10
    wait = limiter.hit(key, 3, 60)

    assert wait == pytest.approx(50)


def test_limiter_window_slides_and_keys_are_independent():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    for _ in range(2):
        limiter.hit(("login", "1.1.1.1"), 2, 60)

    assert limiter.hit(("login", "1.1.1.1"), 2, 60) is not None
    assert limiter.hit(("login", "2.2.2.2"), 2, 60) is None  # other IP
    assert limiter.hit(("refresh", "1.1.1.1"), 2, 60) is None  # other bucket
    clock.now += 61
    assert limiter.hit(("login", "1.1.1.1"), 2, 60) is None  # window passed


@pytest.mark.asyncio
async def test_burst_of_bad_logins_is_rate_limited(client):
    bad = {"email": "nobody@example.com", "password": "wrong"}

    statuses = [
        (await client.post("/auth/login", json=bad)).status_code for _ in range(20)
    ]

    assert statuses[:10] == [401] * 10
    assert set(statuses[10:]) == {429}


@pytest.mark.asyncio
async def test_rate_limited_response_has_retry_after_and_error_body(client):
    bad = {"email": "nobody@example.com", "password": "wrong"}
    for _ in range(10):
        await client.post("/auth/login", json=bad)

    response = await client.post(
        "/auth/login", json=bad, headers={"Origin": "http://localhost:8080"}
    )

    assert response.status_code == 429
    assert int(response.headers["retry-after"]) >= 1
    assert response.json()["error"]["code"] == "rate_limited"
    # inside CORS: the browser must be able to read the 429
    assert response.headers["access-control-allow-origin"] == "http://localhost:8080"


@pytest.mark.asyncio
async def test_api_prefixed_login_shares_the_same_budget(client):
    bad = {"email": "nobody@example.com", "password": "wrong"}
    for _ in range(10):
        await client.post("/auth/login", json=bad)

    assert (await client.post("/api/auth/login", json=bad)).status_code == 429


@pytest.mark.asyncio
async def test_normal_traffic_is_unaffected(client):
    headers = await register_and_login(client)  # 1 login

    statuses = {
        (await client.get("/branches", headers=headers)).status_code for _ in range(60)
    }
    health = {(await client.get("/health")).status_code for _ in range(60)}

    assert statuses == {200}
    assert health == {200}


@pytest.mark.asyncio
async def test_public_bucket_is_looser_than_login(client):
    # No public router on this branch: 404s still count against the bucket.
    statuses = [(await client.get("/public/catalog")).status_code for _ in range(125)]

    assert 429 not in statuses[:120]
    assert statuses[120:] == [429] * 5


def test_forwarded_for_is_only_trusted_when_enabled():
    scope = {
        "type": "http",
        "client": ("10.0.0.1", 1),
        "headers": [(b"x-forwarded-for", b"6.6.6.6, 7.7.7.7")],
    }
    direct = RateLimitMiddleware(None, limits={})
    proxied = RateLimitMiddleware(None, limits={}, trust_forwarded_for=True)

    assert direct._client_ip(scope) == "10.0.0.1"
    assert proxied._client_ip(scope) == "7.7.7.7"  # rightmost = our proxy's view
