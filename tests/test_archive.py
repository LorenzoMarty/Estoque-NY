import pytest

from tests.helpers import create_branch, receipt, register_and_login
from tests.test_public_catalog import _category, _product, _publish, _sku

pytestmark = pytest.mark.asyncio


async def _names(client, headers, path, **params):
    resp = await client.get(path, params=params, headers=headers)
    assert resp.status_code == 200
    return [item["name"] for item in resp.json()["items"]]


async def test_archive_hides_from_lists_and_public_api_and_restore_brings_back(client):
    headers = await register_and_login(client)
    product_id = await _product(client, headers, "Alfa")
    sku_id = await _sku(client, headers, product_id, "S-ALFA", price="10.00")
    await _publish(client, headers, product_id)
    assert (await client.get("/public/v1/catalog")).json()["meta"][
        "total_products"
    ] == 1

    archived = await client.post(
        f"/catalog/products/{product_id}/archive", json={}, headers=headers
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    assert await _names(client, headers, "/catalog/products") == []
    assert await _names(client, headers, "/catalog/products", archived=True) == ["Alfa"]
    sku_list = await client.get("/catalog/skus", headers=headers)
    assert sku_list.json()["items"] == []  # SKU archived with its product
    assert (await client.get("/public/v1/catalog")).json()["meta"][
        "total_products"
    ] == 0

    # history is kept: the rows still exist and can be read by id
    assert (await client.get("/catalog/skus?archived=true", headers=headers)).json()[
        "items"
    ][0]["id"] == sku_id

    restored = await client.post(
        f"/catalog/products/{product_id}/restore", headers=headers
    )
    assert restored.status_code == 200 and restored.json()["archived_at"] is None
    assert await _names(client, headers, "/catalog/products") == ["Alfa"]
    assert (
        len((await client.get("/catalog/skus", headers=headers)).json()["items"]) == 1
    )
    assert (await client.get("/public/v1/catalog")).json()["meta"][
        "total_products"
    ] == 1


async def test_archive_with_stock_needs_force_and_a_reason(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    product_id = await _product(client, headers, "Beta")
    sku_id = await _sku(client, headers, product_id, "S-BETA", price="5.00")
    assert (
        await receipt(client, headers, branch_id, location_id, sku_id, 3)
    ).status_code == 201
    url = f"/catalog/skus/{sku_id}/archive"

    blocked = await client.post(url, json={}, headers=headers)
    assert blocked.status_code == 409 and "3 units" in blocked.text

    no_reason = await client.post(url, json={"force": True}, headers=headers)
    assert no_reason.status_code == 400

    forced = await client.post(
        url, json={"force": True, "reason": "discontinued"}, headers=headers
    )
    assert forced.status_code == 200
    assert forced.json()["archive_reason"] == "discontinued"


async def test_sku_restore_requires_its_product_and_double_archive_conflicts(client):
    headers = await register_and_login(client)
    product_id = await _product(client, headers, "Gama")
    sku_id = await _sku(client, headers, product_id, "S-GAMA")
    await client.post(
        f"/catalog/products/{product_id}/archive", json={}, headers=headers
    )

    again = await client.post(
        f"/catalog/products/{product_id}/archive", json={}, headers=headers
    )
    assert again.status_code == 409
    blocked = await client.post(f"/catalog/skus/{sku_id}/restore", headers=headers)
    assert blocked.status_code == 409 and "product first" in blocked.text


async def test_restoring_a_product_leaves_skus_archived_earlier_archived(client):
    headers = await register_and_login(client)
    product_id = await _product(client, headers, "Delta")
    old_sku = await _sku(client, headers, product_id, "S-OLD")
    await _sku(client, headers, product_id, "S-NEW")
    await client.post(f"/catalog/skus/{old_sku}/archive", json={}, headers=headers)
    await client.post(
        f"/catalog/products/{product_id}/archive", json={}, headers=headers
    )

    await client.post(f"/catalog/products/{product_id}/restore", headers=headers)

    live = await client.get("/catalog/skus", headers=headers)
    assert [s["sku_code"] for s in live.json()["items"]] == ["S-NEW"]


async def test_category_with_active_products_cannot_be_archived(client):
    headers = await register_and_login(client)
    category_id = await _category(client, headers, "Perfumes")
    product_id = await _product(client, headers, "Eps", category_id=category_id)

    blocked = await client.post(
        f"/catalog/categories/{category_id}/archive", json={}, headers=headers
    )
    assert blocked.status_code == 409

    await client.post(
        f"/catalog/products/{product_id}/archive", json={}, headers=headers
    )
    ok = await client.post(
        f"/catalog/categories/{category_id}/archive", json={}, headers=headers
    )
    assert ok.status_code == 200
    assert await _names(client, headers, "/catalog/categories") == []
    assert await _names(client, headers, "/catalog/categories", archived=True) == [
        "Perfumes"
    ]
    restored = await client.post(
        f"/catalog/categories/{category_id}/restore", headers=headers
    )
    assert restored.status_code == 200


async def test_archive_requires_update_permission(client):
    headers = await register_and_login(client)
    product_id = await _product(client, headers, "Zeta")
    anon = await client.post(f"/catalog/products/{product_id}/archive", json={})
    assert anon.status_code in (401, 403)
