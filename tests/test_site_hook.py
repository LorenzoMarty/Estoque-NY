import pytest

from app.core import site_hook
from app.core.config import get_settings
from tests.helpers import create_sku, register_and_login


@pytest.fixture
def hook_calls(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(site_hook, "_post", calls.append)
    monkeypatch.setattr(site_hook, "_last_call", float("-inf"))
    monkeypatch.setattr(site_hook, "_pending", None)
    return calls


@pytest.mark.asyncio
async def test_catalog_change_pings_site_once_per_window(
    client, monkeypatch, hook_calls
):
    monkeypatch.setenv("SITE_REVALIDATE_URL", "https://site.example/hook")
    monkeypatch.setenv("SITE_REVALIDATE_DEBOUNCE_SECONDS", "3600")
    get_settings.cache_clear()
    headers = await register_and_login(client)

    await create_sku(client, headers, sku_code="H-1")
    await create_sku(client, headers, sku_code="H-2")
    await client.patch("/catalog/products/1", json={"published": True}, headers=headers)
    await site_hook.asyncio.sleep(0.05)

    # leading call only; the rest is one pending trailing call inside the window
    assert hook_calls == ["https://site.example/hook"]
    assert site_hook._pending is not None
    site_hook._pending.cancel()


@pytest.mark.asyncio
async def test_no_url_no_call(client, hook_calls):
    headers = await register_and_login(client)
    await create_sku(client, headers, sku_code="H-3")
    await site_hook.asyncio.sleep(0.05)
    assert hook_calls == []
