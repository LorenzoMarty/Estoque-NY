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


def _scope(forwarded: bytes | None, client="10.0.0.1"):
    headers = [] if forwarded is None else [(b"x-forwarded-for", forwarded)]
    return {"type": "http", "client": (client, 1), "headers": headers}


def test_forwarded_for_is_only_trusted_when_enabled():
    scope = _scope(b"6.6.6.6, 7.7.7.7")
    direct = RateLimitMiddleware(None, limits={})
    one_proxy = RateLimitMiddleware(None, limits={}, trusted_proxy_hops=1)

    assert direct._client_ip(scope) == "10.0.0.1"
    assert one_proxy._client_ip(scope) == "7.7.7.7"  # appended by our own proxy


def test_two_trusted_proxies_read_the_entry_two_places_from_the_right():
    # the client, then the address the first proxy saw (the second proxy)
    scope = _scope(b"1.2.3.4, 9.9.9.9")
    two = RateLimitMiddleware(None, limits={}, trusted_proxy_hops=2)

    assert two._client_ip(scope) == "1.2.3.4"


def test_a_forged_left_entry_does_not_change_the_client_ip():
    one = RateLimitMiddleware(None, limits={}, trusted_proxy_hops=1)

    assert one._client_ip(_scope(b"1.1.1.1, 2.2.2.2, 7.7.7.7")) == "7.7.7.7"


@pytest.mark.parametrize("header", [None, b"", b" , "])
def test_missing_or_empty_forwarded_for_falls_back_to_the_socket_address(header):
    one = RateLimitMiddleware(None, limits={}, trusted_proxy_hops=1)

    assert one._client_ip(_scope(header)) == "10.0.0.1"


def test_fewer_entries_than_hops_uses_the_first_one():
    three = RateLimitMiddleware(None, limits={}, trusted_proxy_hops=3)

    assert three._client_ip(_scope(b"5.5.5.5")) == "5.5.5.5"


def test_idle_keys_are_evicted_but_only_once_per_window(monkeypatch):
    import app.core.rate_limit as module

    monkeypatch.setattr(module, "_MAX_TRACKED_KEYS", 3)
    clock = FakeClock()
    limiter = SlidingWindowLimiter(clock)
    for ip in "abcd":
        limiter.hit(("login", ip), 5, 60)
    assert len(limiter._hits) == 4

    clock.now += 61  # all four are idle now
    limiter.hit(("login", "e"), 5, 60)

    assert set(limiter._hits) == {("login", "e")}
    for ip in "fghi":  # a burst of new keys right after: no second sweep in this window
        limiter.hit(("login", ip), 5, 60)
    assert len(limiter._hits) == 5


def test_the_table_has_a_hard_ceiling(monkeypatch):
    import app.core.rate_limit as module

    monkeypatch.setattr(module, "_MAX_TRACKED_KEYS", 2)
    monkeypatch.setattr(module, "_HARD_CAP", 5)
    limiter = SlidingWindowLimiter(FakeClock())  # clock never advances: nothing is idle

    for index in range(20):
        limiter.hit(("login", str(index)), 5, 60)

    assert len(limiter._hits) <= 6  # the cap, plus the key added this call
    assert ("login", "19") in limiter._hits  # the newest survives


@pytest.mark.asyncio
async def test_refresh_has_its_own_looser_budget_than_login(client):
    body = {"refresh_token": "not-a-token"}

    statuses = [
        (await client.post("/auth/refresh", json=body)).status_code for _ in range(35)
    ]

    assert statuses[:30] == [401] * 30
    assert set(statuses[30:]) == {429}
    # login is a separate bucket and still has its whole budget
    assert (
        await client.post("/auth/login", json={"email": "x@y.com", "password": "x"})
    ).status_code == 401
