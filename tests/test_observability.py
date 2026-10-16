import pytest
import sentry_sdk
from httpx import ASGITransport, AsyncClient
from sentry_sdk.transport import Transport

from app.core.config import Settings
from app.core.observability import init_sentry
from app.main import create_app

DSN = "http://public@localhost:9/1"


class CapturingTransport(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.events: list[dict] = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(item.payload.json)


@pytest.fixture
def sentry():
    transport = CapturingTransport()
    yield transport
    sentry_sdk.init()  # back to no-op so other tests are untouched


def _settings(**overrides) -> Settings:
    return Settings(**{"app_env": "test", "_env_file": None, **overrides})


def test_sentry_stays_off_without_a_dsn():
    assert init_sentry(_settings(sentry_dsn="")) is False
    assert init_sentry(_settings(sentry_dsn="   ")) is False


def _app_with_boom():
    app = create_app()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("forced failure")

    return app


@pytest.mark.asyncio
async def test_a_forced_exception_reaches_sentry_with_the_request_id(sentry):
    app = _app_with_boom()
    assert init_sentry(_settings(sentry_dsn=DSN, app_env="staging"), transport=sentry)

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/boom", headers={"X-Request-ID": "req-123"})
    sentry_sdk.flush()

    assert response.status_code == 500
    assert response.json()["error"]["request_id"] == "req-123"
    errors = [e for e in sentry.events if "exception" in e]
    assert len(errors) == 1
    event = errors[0]
    assert event["exception"]["values"][0]["type"] == "RuntimeError"
    assert event["tags"]["request_id"] == "req-123"
    assert event["environment"] == "staging"


@pytest.mark.asyncio
async def test_expected_client_errors_and_healthy_requests_send_nothing(sentry):
    app = _app_with_boom()
    init_sentry(_settings(sentry_dsn=DSN), transport=sentry)

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        assert (await client.get("/health")).status_code == 200
        assert (await client.get("/does-not-exist")).status_code == 404
        assert (await client.get("/catalog/products")).status_code == 401
    sentry_sdk.flush()

    assert sentry.events == []


def test_release_traces_and_pii_settings_are_applied(sentry):
    init_sentry(
        _settings(
            sentry_dsn=DSN, sentry_release="abc123", sentry_traces_sample_rate=0.25
        ),
        transport=sentry,
    )

    options = sentry_sdk.get_client().options
    assert options["release"] == "abc123"
    assert options["traces_sample_rate"] == 0.25
    assert options["send_default_pii"] is False
