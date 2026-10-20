import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import create_app


async def _get(host="testserver"):
    get_settings.cache_clear()
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url=f"http://{host}"
    ) as c:
        return await c.get("/health")


def _env(monkeypatch, **kw):
    for k, v in kw.items():
        monkeypatch.setenv(k, v)


@pytest.mark.asyncio
async def test_headers_without_hsts_outside_production(client):
    r = await client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "strict-transport-security" not in r.headers


@pytest.mark.asyncio
async def test_hsts_in_production(monkeypatch):
    _env(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="s3cret",
        DATABASE_URL="postgresql://u:p@db.example.com/x",
        CORS_ORIGINS="https://app.example.com",
    )
    r = await _get()
    get_settings.cache_clear()
    assert r.headers["strict-transport-security"].startswith("max-age=")


@pytest.mark.asyncio
async def test_untrusted_host_rejected(monkeypatch):
    _env(monkeypatch, ALLOWED_HOSTS="api.example.com")
    bad = await _get("evil.test")
    good = await _get("api.example.com")
    get_settings.cache_clear()
    assert bad.status_code == 400
    assert bad.headers["x-content-type-options"] == "nosniff"
    assert good.status_code != 400
