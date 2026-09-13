import pytest


async def _auth_headers(client, prefix: str = "") -> dict[str, str]:
    register_payload = {
        "name": "Admin User",
        "email": "admin@example.com",
        "password": "Password123!",
    }
    register_response = await client.post(
        f"{prefix}/auth/register",
        json=register_payload,
    )
    assert register_response.status_code == 201

    login_response = await client.post(
        f"{prefix}/auth/login",
        json={
            "email": register_payload["email"],
            "password": register_payload["password"],
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


@pytest.mark.asyncio
async def test_admin_routes_require_auth(client):
    response = await client.get("/branches")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["message"] == "missing bearer token"


@pytest.mark.asyncio
async def test_health_routes_available_with_and_without_api_prefix(client):
    direct_health = await client.get("/health")
    assert direct_health.status_code == 200
    assert direct_health.json()["status"] == "ok"

    vercel_health = await client.get("/api/health")
    assert vercel_health.status_code == 200
    assert vercel_health.json()["status"] == "ok"

    direct_db_health = await client.get("/health/db")
    assert direct_db_health.status_code == 200
    assert direct_db_health.json()["db"] == "up"

    vercel_db_health = await client.get("/api/health/db")
    assert vercel_db_health.status_code == 200
    assert vercel_db_health.json()["db"] == "up"


@pytest.mark.asyncio
async def test_auth_routes_available_with_api_prefix(client):
    headers = await _auth_headers(client, prefix="/api")
    response = await client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.com"


@pytest.mark.asyncio
async def test_admin_crud_branches_locations_brands(client):
    headers = await _auth_headers(client)

    create_branch = await client.post(
        "/branches",
        json={"name": "Filial Matriz"},
        headers=headers,
    )
    assert create_branch.status_code == 201
    branch = create_branch.json()
    branch_id = branch["id"]

    list_branches = await client.get(
        "/branches?page=1&page_size=20&sort=name&order=asc&q=matriz",
        headers=headers,
    )
    assert list_branches.status_code == 200
    branches_payload = list_branches.json()
    assert branches_payload["meta"]["total"] >= 1
    assert any(row["id"] == branch_id for row in branches_payload["items"])

    update_branch = await client.put(
        f"/branches/{branch_id}",
        json={"name": "Filial Centro"},
        headers=headers,
    )
    assert update_branch.status_code == 200
    assert update_branch.json()["name"] == "Filial Centro"

    create_location = await client.post(
        "/locations",
        json={
            "branch_id": branch_id,
            "name": "Deposito A",
            "type": "STOCK",
        },
        headers=headers,
    )
    assert create_location.status_code == 201
    location = create_location.json()
    location_id = location["id"]
    assert location["branch_id"] == branch_id

    list_locations = await client.get(
        f"/locations?page=1&page_size=20&branch_id={branch_id}",
        headers=headers,
    )
    assert list_locations.status_code == 200
    locations_payload = list_locations.json()
    assert locations_payload["meta"]["total"] >= 1
    assert any(row["id"] == location_id for row in locations_payload["items"])

    update_location = await client.put(
        f"/locations/{location_id}",
        json={
            "branch_id": branch_id,
            "name": "Deposito Principal",
            "type": "STORE",
        },
        headers=headers,
    )
    assert update_location.status_code == 200
    assert update_location.json()["name"] == "Deposito Principal"

    create_brand = await client.post(
        "/catalog/brands",
        json={"name": "Marca Teste"},
        headers=headers,
    )
    assert create_brand.status_code == 201
    brand_id = create_brand.json()["id"]

    list_brands = await client.get(
        "/catalog/brands?page=1&page_size=20&sort=name&order=asc&q=teste",
        headers=headers,
    )
    assert list_brands.status_code == 200
    brands_payload = list_brands.json()
    assert brands_payload["meta"]["total"] >= 1
    assert any(row["id"] == brand_id for row in brands_payload["items"])

    update_brand = await client.put(
        f"/catalog/brands/{brand_id}",
        json={"name": "Marca Atualizada"},
        headers=headers,
    )
    assert update_brand.status_code == 200
    assert update_brand.json()["name"] == "Marca Atualizada"

    delete_branch_with_location = await client.delete(
        f"/branches/{branch_id}",
        headers=headers,
    )
    assert delete_branch_with_location.status_code == 400
    assert (
        delete_branch_with_location.json()["error"]["message"]
        == "cannot delete branch with associated locations"
    )

    delete_brand = await client.delete(
        f"/catalog/brands/{brand_id}",
        headers=headers,
    )
    assert delete_brand.status_code == 204

    delete_location = await client.delete(
        f"/locations/{location_id}",
        headers=headers,
    )
    assert delete_location.status_code == 204

    delete_branch = await client.delete(
        f"/branches/{branch_id}",
        headers=headers,
    )
    assert delete_branch.status_code == 204


@pytest.mark.asyncio
async def test_marketing_domain_crud_and_catalog_links(client):
    headers = await _auth_headers(client)

    create_channel = await client.post(
        "/marketing/channels",
        json={"name": "Instagram", "type": "SOCIAL"},
        headers=headers,
    )
    assert create_channel.status_code == 201
    channel_id = create_channel.json()["id"]

    create_product = await client.post(
        "/catalog/products",
        json={"name": "Produto Campanha", "active": True},
        headers=headers,
    )
    assert create_product.status_code == 201
    product_id = create_product.json()["id"]

    create_sku = await client.post(
        "/catalog/skus",
        json={
            "product_id": product_id,
            "sku_code": "SKU-MKT-001",
            "name": "Produto Campanha UN",
            "unit": "UN",
            "price": "99.90",
        },
        headers=headers,
    )
    assert create_sku.status_code == 201
    sku_id = create_sku.json()["id"]

    create_campaign = await client.post(
        "/marketing/campaigns",
        json={
            "name": "Campanha Julho",
            "status": "SCHEDULED",
            "channel_id": channel_id,
            "objective": "Aumentar giro de produtos selecionados",
            "budget": "1500.00",
            "starts_at": "2026-07-10T00:00:00Z",
            "ends_at": "2026-07-31T23:59:59Z",
            "product_ids": [product_id],
        },
        headers=headers,
    )
    assert create_campaign.status_code == 201
    campaign = create_campaign.json()
    campaign_id = campaign["id"]
    assert campaign["product_ids"] == [product_id]

    list_campaigns = await client.get(
        "/marketing/campaigns?status=SCHEDULED&q=julho",
        headers=headers,
    )
    assert list_campaigns.status_code == 200
    campaign_items = list_campaigns.json()["items"]
    assert any(row["id"] == campaign_id for row in campaign_items)

    update_campaign = await client.patch(
        f"/marketing/campaigns/{campaign_id}",
        json={"status": "ACTIVE", "product_ids": []},
        headers=headers,
    )
    assert update_campaign.status_code == 200
    assert update_campaign.json()["status"] == "ACTIVE"
    assert update_campaign.json()["product_ids"] == []

    create_promotion = await client.post(
        "/marketing/promotions",
        json={
            "name": "Desconto Julho",
            "campaign_id": campaign_id,
            "status": "ACTIVE",
            "discount_type": "PERCENT",
            "discount_value": "10",
            "sku_ids": [sku_id],
        },
        headers=headers,
    )
    assert create_promotion.status_code == 201
    promotion = create_promotion.json()
    assert promotion["sku_ids"] == [sku_id]

    create_segment = await client.post(
        "/marketing/audience-segments",
        json={
            "name": "Clientes recorrentes",
            "description": "Compradores com pedidos recentes",
            "rules_json": {"orders_last_days": 90},
        },
        headers=headers,
    )
    assert create_segment.status_code == 201

    create_asset = await client.post(
        "/marketing/content-assets",
        json={
            "title": "Banner principal",
            "asset_type": "banner",
            "campaign_id": campaign_id,
            "url": "https://example.com/banner.png",
        },
        headers=headers,
    )
    assert create_asset.status_code == 201

    list_assets = await client.get(
        f"/marketing/content-assets?campaign_id={campaign_id}",
        headers=headers,
    )
    assert list_assets.status_code == 200
    assert list_assets.json()["meta"]["total"] == 1
