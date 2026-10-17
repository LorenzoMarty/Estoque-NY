import pytest

from tests.helpers import create_sku, register_and_login

# resource path -> minimal valid payload
RESOURCES = {
    "channels": {"name": "Instagram", "type": "SOCIAL"},
    "audience-segments": {"name": "Turistas", "rules_json": {"country": "AR"}},
    "content-assets": {
        "title": "Banner",
        "asset_type": "image",
        "url": "https://x.test/a.png",
    },
}


@pytest.mark.asyncio
async def test_marketing_routes_require_auth(client):
    for path in (
        "channels",
        "campaigns",
        "promotions",
        "audience-segments",
        "content-assets",
    ):
        assert (await client.get(f"/marketing/{path}")).status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", list(RESOURCES))
async def test_simple_resources_create_list_get_update(client, resource):
    headers = await register_and_login(client)
    payload = RESOURCES[resource]

    created = await client.post(f"/marketing/{resource}", json=payload, headers=headers)
    assert created.status_code == 201
    item_id = created.json()["id"]

    listed = await client.get(f"/marketing/{resource}", headers=headers)
    assert listed.status_code == 200
    assert [i["id"] for i in listed.json()["items"]] == [item_id]

    field = "title" if resource == "content-assets" else "name"
    updated = await client.patch(
        f"/marketing/{resource}/{item_id}", json={field: "Renomeado"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()[field] == "Renomeado"


@pytest.mark.asyncio
@pytest.mark.parametrize("resource", list(RESOURCES))
async def test_update_of_missing_resource_is_404(client, resource):
    headers = await register_and_login(client)
    field = "title" if resource == "content-assets" else "name"

    response = await client.patch(
        f"/marketing/{resource}/9999", json={field: "x"}, headers=headers
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_blank_names_are_rejected(client):
    headers = await register_and_login(client)

    response = await client.post(
        "/marketing/channels", json={"name": "   ", "type": "SOCIAL"}, headers=headers
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_campaign_links_products_and_can_relink(client):
    headers = await register_and_login(client)
    sku_a = await create_sku(client, headers, sku_code="MK-A")
    sku_b = await create_sku(client, headers, sku_code="MK-B")
    products = {
        sku: (await client.get("/catalog/skus", headers=headers)).json()["items"]
        for sku in (sku_a, sku_b)
    }
    product_ids = sorted({i["product_id"] for i in products[sku_a]})

    created = await client.post(
        "/marketing/campaigns",
        json={"name": "Verao", "status": "ACTIVE", "product_ids": product_ids[:1]},
        headers=headers,
    )
    assert created.status_code == 201
    campaign_id = created.json()["id"]
    assert created.json()["product_ids"] == product_ids[:1]

    relinked = await client.patch(
        f"/marketing/campaigns/{campaign_id}",
        json={"product_ids": product_ids},
        headers=headers,
    )
    assert relinked.status_code == 200
    assert sorted(relinked.json()["product_ids"]) == product_ids

    fetched = await client.get(f"/marketing/campaigns/{campaign_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Verao"


@pytest.mark.asyncio
async def test_campaign_with_unknown_product_or_channel_is_rejected(client):
    headers = await register_and_login(client)

    bad_product = await client.post(
        "/marketing/campaigns",
        json={"name": "X", "status": "ACTIVE", "product_ids": [9999]},
        headers=headers,
    )
    bad_channel = await client.post(
        "/marketing/campaigns",
        json={"name": "X", "status": "ACTIVE", "channel_id": 9999},
        headers=headers,
    )

    assert bad_product.status_code in {400, 404}
    assert bad_channel.status_code in {400, 404}


@pytest.mark.asyncio
async def test_promotion_links_skus_and_can_relink(client):
    headers = await register_and_login(client)
    sku_a = await create_sku(client, headers, sku_code="PR-A")
    sku_b = await create_sku(client, headers, sku_code="PR-B")

    created = await client.post(
        "/marketing/promotions",
        json={
            "name": "Promo",
            "status": "ACTIVE",
            "discount_type": "PERCENT",
            "discount_value": "10",
            "sku_ids": [sku_a],
        },
        headers=headers,
    )
    assert created.status_code == 201
    promotion_id = created.json()["id"]

    relinked = await client.patch(
        f"/marketing/promotions/{promotion_id}",
        json={"sku_ids": [sku_a, sku_b]},
        headers=headers,
    )
    assert relinked.status_code == 200
    assert sorted(relinked.json()["sku_ids"]) == sorted([sku_a, sku_b])
