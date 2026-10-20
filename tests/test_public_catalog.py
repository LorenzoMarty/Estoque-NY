import pytest

from tests.helpers import create_branch, receipt, register_and_login

pytestmark = pytest.mark.asyncio

ITEM_KEYS = {
    "id",
    "brand",
    "name",
    "description",
    "price_usd",
    "price_is_from",
    "featured",
    "image_url",
    "in_stock",
}


async def _category(client, headers, name):
    response = await client.post(
        "/catalog/categories", json={"name": name}, headers=headers
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _product(client, headers, name, **extra):
    payload = {"name": name, "brand": "Marca X", "description": "Desc", **extra}
    response = await client.post("/catalog/products", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


async def _sku(client, headers, product_id, code, price="0", active=True):
    response = await client.post(
        "/catalog/skus",
        json={
            "product_id": product_id,
            "sku_code": code,
            "cost": "7.00",
            "price": price,
            "active": active,
        },
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _publish(client, headers, product_id, **extra):
    response = await client.patch(
        f"/catalog/products/{product_id}",
        json={"published": True, **extra},
        headers=headers,
    )
    assert response.status_code == 200
    return response.json()


async def _items(client):
    response = await client.get("/public/catalog")
    assert response.status_code == 200
    return response.json()


async def test_public_catalog_is_open_and_empty_without_published_products(client):
    assert await _items(client) == {"sectors": []}


async def test_only_published_and_active_products_are_listed(client):
    headers = await register_and_login(client)
    category = await _category(client, headers, "Perfumaria")
    shown = await _product(client, headers, "Visivel", category_id=category)
    await _product(client, headers, "Rascunho", category_id=category)
    inactive = await _product(client, headers, "Inativo", category_id=category)
    await _publish(client, headers, shown)
    await _publish(client, headers, inactive)
    await client.patch(
        f"/catalog/products/{inactive}", json={"active": False}, headers=headers
    )

    body = await _items(client)

    assert [s["name"] for s in body["sectors"]] == ["Perfumaria"]
    assert [p["name"] for p in body["sectors"][0]["products"]] == ["Visivel"]


async def test_products_are_grouped_by_category_with_fallback_sector(client):
    headers = await register_and_login(client)
    perfume = await _category(client, headers, "Perfumaria")
    a = await _product(client, headers, "A", category_id=perfume)
    b = await _product(client, headers, "B")
    await _publish(client, headers, a)
    await _publish(client, headers, b)

    sectors = (await _items(client))["sectors"]
    names = {s["name"]: [p["name"] for p in s["products"]] for s in sectors}

    assert names == {"Perfumaria": ["A"], "Outros": ["B"]}


async def test_price_is_lowest_positive_active_sku_price(client):
    headers = await register_and_login(client)
    product = await _product(client, headers, "P")
    await _sku(client, headers, product, "P-1", price="129.00")
    await _sku(client, headers, product, "P-2", price="99.50")
    await _sku(client, headers, product, "P-3", price="0")
    await _sku(client, headers, product, "P-4", price="10.00", active=False)
    await _publish(client, headers, product)

    item = (await _items(client))["sectors"][0]["products"][0]

    assert item["price_usd"] == "99.50"
    assert item["price_is_from"] is True


async def test_price_is_not_from_when_all_prices_match_and_null_without_price(client):
    headers = await register_and_login(client)
    same = await _product(client, headers, "Same")
    await _sku(client, headers, same, "S-1", price="50.00")
    await _sku(client, headers, same, "S-2", price="50.00")
    free = await _product(client, headers, "Unpriced")
    await _sku(client, headers, free, "U-1", price="0")
    await _publish(client, headers, same)
    await _publish(client, headers, free)

    products = {
        p["name"]: p for s in (await _items(client))["sectors"] for p in s["products"]
    }

    assert products["Same"]["price_usd"] == "50.00"
    assert products["Same"]["price_is_from"] is False
    assert products["Unpriced"]["price_usd"] is None
    assert products["Unpriced"]["price_is_from"] is False


async def test_in_stock_follows_active_sku_balance(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    product = await _product(client, headers, "Estoque")
    sku = await _sku(client, headers, product, "E-1", price="20.00")
    await _publish(client, headers, product)

    assert (await _items(client))["sectors"][0]["products"][0]["in_stock"] is False

    response = await receipt(client, headers, branch_id, location_id, sku, 3)
    assert response.status_code == 201

    assert (await _items(client))["sectors"][0]["products"][0]["in_stock"] is True

    await client.patch(f"/catalog/skus/{sku}", json={"active": False}, headers=headers)

    assert (await _items(client))["sectors"][0]["products"][0]["in_stock"] is False


async def test_response_never_leaks_internal_fields(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    product = await _product(client, headers, "Seguro")
    sku = await _sku(client, headers, product, "SECRET-CODE", price="20.00")
    await receipt(client, headers, branch_id, location_id, sku, 5)
    await _publish(client, headers, product, image_url="https://cdn.example.com/a.webp")

    response = await client.get("/public/catalog")
    item = response.json()["sectors"][0]["products"][0]

    assert set(item) == ITEM_KEYS
    for leaked in ("SECRET-CODE", "cost", "on_hand", "branch", "barcode", "7.00"):
        assert leaked not in response.text


async def test_public_catalog_is_read_only_and_also_served_under_api_prefix(client):
    assert (await client.get("/api/public/catalog")).status_code == 200
    assert (await client.post("/public/catalog", json={})).status_code == 405
    assert (await client.delete("/public/catalog")).status_code == 405


async def test_featured_published_and_image_url_round_trip_on_the_product(client):
    headers = await register_and_login(client)
    product = await _product(client, headers, "Campos")

    listing = await client.get("/catalog/products?active=true", headers=headers)
    created = listing.json()
    assert created["items"][0]["published"] is False
    assert created["items"][0]["featured"] is False
    assert created["items"][0]["image_url"] is None

    updated = await _publish(
        client,
        headers,
        product,
        featured=True,
        image_url="https://cdn.example.com/p.webp",
    )

    assert updated["published"] is True
    assert updated["featured"] is True
    assert updated["image_url"] == "https://cdn.example.com/p.webp"


@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(1)",
        "ftp://x/y.png",
        "//cdn/x.png",
        "not a url",
        "data:image/png;base64,AAAA",
    ],
)
async def test_image_url_must_be_http_or_https(client, bad):
    headers = await register_and_login(client)
    product = await _product(client, headers, "Img")

    patched = await client.patch(
        f"/catalog/products/{product}", json={"image_url": bad}, headers=headers
    )
    created = await client.post(
        "/catalog/products", json={"name": "Novo", "image_url": bad}, headers=headers
    )

    assert patched.status_code == 400
    assert created.status_code == 400


async def test_brand_comes_from_the_registered_brand_before_the_legacy_field(client):
    headers = await register_and_login(client)
    brand = await client.post("/catalog/brands", json={"name": "Dior"}, headers=headers)
    assert brand.status_code == 201
    registered = await _product(
        client, headers, "Via cadastro", brand_id=brand.json()["id"]
    )
    legacy = await _product(client, headers, "Via campo legado", brand="Chanel")
    await _publish(client, headers, registered)
    await _publish(client, headers, legacy)

    products = {
        p["name"]: p for s in (await _items(client))["sectors"] for p in s["products"]
    }

    assert products["Via cadastro"]["brand"] == "Dior"
    assert products["Via campo legado"]["brand"] == "Chanel"
