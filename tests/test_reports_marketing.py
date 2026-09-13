import pytest


async def _auth_headers(client) -> dict[str, str]:
    register_payload = {
        "name": "Admin User",
        "email": "admin@example.com",
        "password": "Password123!",
    }
    register_response = await client.post("/auth/register", json=register_payload)
    assert register_response.status_code == 201

    login_response = await client.post(
        "/auth/login",
        json={
            "email": register_payload["email"],
            "password": register_payload["password"],
        },
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}


async def _create_branch(client, headers, name="Filial A") -> tuple[int, int]:
    response = await client.post("/branches", json={"name": name}, headers=headers)
    assert response.status_code == 201
    branch_id = response.json()["id"]

    location_response = await client.post(
        "/locations",
        json={"branch_id": branch_id, "name": f"{name} - Deposito", "type": "STOCK"},
        headers=headers,
    )
    assert location_response.status_code == 201
    return branch_id, location_response.json()["id"]


async def _create_product_and_sku(
    client,
    headers,
    *,
    product_name="Produto A",
    sku_code="SKU-A-1",
    cost="10.00",
    price="20.00",
) -> tuple[int, int]:
    product_response = await client.post(
        "/catalog/products",
        json={"name": product_name, "active": True},
        headers=headers,
    )
    assert product_response.status_code == 201
    product_id = product_response.json()["id"]

    sku_response = await client.post(
        "/catalog/skus",
        json={
            "product_id": product_id,
            "sku_code": sku_code,
            "name": product_name,
            "unit": "UN",
            "cost": cost,
            "price": price,
        },
        headers=headers,
    )
    assert sku_response.status_code == 201
    return product_id, sku_response.json()["id"]


async def _receipt(client, headers, branch_id, location_id, sku_id, qty) -> None:
    response = await client.post(
        "/stock/receipts",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        },
        headers=headers,
    )
    assert response.status_code == 201


async def _issue(client, headers, branch_id, location_id, sku_id, qty) -> None:
    response = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        },
        headers=headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_reports_marketing_requires_auth(client):
    response = await client.get("/reports/marketing/dashboard-summary")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_campaign_products_report_returns_aggregated_stock(client):
    headers = await _auth_headers(client)
    branch_id, location_id = await _create_branch(client, headers)
    product_id, sku_id = await _create_product_and_sku(client, headers)
    await _receipt(client, headers, branch_id, location_id, sku_id, 10)

    create_campaign = await client.post(
        "/marketing/campaigns",
        json={"name": "Campanha A", "status": "ACTIVE", "product_ids": [product_id]},
        headers=headers,
    )
    assert create_campaign.status_code == 201
    campaign_id = create_campaign.json()["id"]

    response = await client.get(
        f"/reports/marketing/campaign-products?campaign_id={campaign_id}",
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == product_id
    assert items[0]["campaign_id"] == campaign_id
    assert items[0]["on_hand"] == 10


@pytest.mark.asyncio
async def test_promotion_skus_report_returns_price_and_cost(client):
    headers = await _auth_headers(client)
    _, sku_id = await _create_product_and_sku(client, headers)

    create_promotion = await client.post(
        "/marketing/promotions",
        json={
            "name": "Promo A",
            "status": "ACTIVE",
            "discount_type": "PERCENT",
            "discount_value": "10",
            "sku_ids": [sku_id],
        },
        headers=headers,
    )
    assert create_promotion.status_code == 201
    promotion_id = create_promotion.json()["id"]

    response = await client.get(
        f"/reports/marketing/promotion-skus?promotion_id={promotion_id}",
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["sku_id"] == sku_id
    assert items[0]["promotion_id"] == promotion_id
    assert items[0]["cost"] == "10.00"
    assert items[0]["price"] == "20.00"


@pytest.mark.asyncio
async def test_campaigns_report_filters_by_period_and_channel(client):
    headers = await _auth_headers(client)

    channel_a = await client.post(
        "/marketing/channels",
        json={"name": "Instagram", "type": "SOCIAL"},
        headers=headers,
    )
    assert channel_a.status_code == 201
    channel_a_id = channel_a.json()["id"]

    channel_b = await client.post(
        "/marketing/channels", json={"name": "Email", "type": "EMAIL"}, headers=headers
    )
    assert channel_b.status_code == 201
    channel_b_id = channel_b.json()["id"]

    campaign_in_period = await client.post(
        "/marketing/campaigns",
        json={
            "name": "Campanha Janeiro",
            "status": "ACTIVE",
            "channel_id": channel_a_id,
            "starts_at": "2026-01-01T00:00:00Z",
            "ends_at": "2026-01-31T23:59:59Z",
        },
        headers=headers,
    )
    assert campaign_in_period.status_code == 201
    campaign_in_period_id = campaign_in_period.json()["id"]

    campaign_out_of_period = await client.post(
        "/marketing/campaigns",
        json={
            "name": "Campanha Marco",
            "status": "ACTIVE",
            "channel_id": channel_b_id,
            "starts_at": "2026-03-01T00:00:00Z",
            "ends_at": "2026-03-31T23:59:59Z",
        },
        headers=headers,
    )
    assert campaign_out_of_period.status_code == 201

    response = await client.get(
        "/reports/marketing/campaigns"
        f"?channel_id={channel_a_id}&from_date=2026-01-01T00:00:00Z&to_date=2026-01-31T23:59:59Z",
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == campaign_in_period_id


@pytest.mark.asyncio
async def test_low_turnover_candidates_report_respects_threshold(client):
    headers = await _auth_headers(client)
    branch_id, location_id = await _create_branch(client, headers)
    _, sku_id = await _create_product_and_sku(client, headers)
    await _receipt(client, headers, branch_id, location_id, sku_id, 100)
    await _issue(client, headers, branch_id, location_id, sku_id, 1)

    included = await client.get(
        f"/reports/marketing/low-turnover-candidates?threshold=0.5&branch_id={branch_id}",
        headers=headers,
    )
    assert included.status_code == 200
    included_items = included.json()["items"]
    assert any(row["sku_id"] == sku_id for row in included_items)

    excluded = await client.get(
        f"/reports/marketing/low-turnover-candidates?threshold=0.0&branch_id={branch_id}",
        headers=headers,
    )
    assert excluded.status_code == 200
    excluded_items = excluded.json()["items"]
    assert not any(row["sku_id"] == sku_id for row in excluded_items)


@pytest.mark.asyncio
async def test_low_turnover_candidates_excludes_fully_depleted_fast_movers(client):
    headers = await _auth_headers(client)
    branch_id, location_id = await _create_branch(client, headers)
    _, sku_id = await _create_product_and_sku(client, headers)
    await _receipt(client, headers, branch_id, location_id, sku_id, 100)
    await _issue(client, headers, branch_id, location_id, sku_id, 100)

    response = await client.get(
        f"/reports/marketing/low-turnover-candidates?threshold=0.5&branch_id={branch_id}",
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert not any(row["sku_id"] == sku_id for row in items)


@pytest.mark.asyncio
async def test_campaign_products_report_includes_zero_stock_when_branch_filtered(
    client,
):
    headers = await _auth_headers(client)
    branch_id, _ = await _create_branch(client, headers)
    product_id, _ = await _create_product_and_sku(client, headers)

    create_campaign = await client.post(
        "/marketing/campaigns",
        json={
            "name": "Campanha Sem Estoque",
            "status": "ACTIVE",
            "product_ids": [product_id],
        },
        headers=headers,
    )
    assert create_campaign.status_code == 201
    campaign_id = create_campaign.json()["id"]

    response = await client.get(
        f"/reports/marketing/campaign-products?campaign_id={campaign_id}&branch_id={branch_id}",
        headers=headers,
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["product_id"] == product_id
    assert items[0]["on_hand"] == 0


@pytest.mark.asyncio
async def test_dashboard_summary_aggregates_stock_and_marketing(client):
    headers = await _auth_headers(client)
    branch_id, location_id = await _create_branch(client, headers)
    _, sku_id = await _create_product_and_sku(client, headers)
    await _receipt(client, headers, branch_id, location_id, sku_id, 50)
    await _issue(client, headers, branch_id, location_id, sku_id, 5)

    create_campaign = await client.post(
        "/marketing/campaigns",
        json={"name": "Campanha Ativa", "status": "ACTIVE"},
        headers=headers,
    )
    assert create_campaign.status_code == 201

    create_promotion = await client.post(
        "/marketing/promotions",
        json={
            "name": "Promo Ativa",
            "status": "ACTIVE",
            "discount_type": "PERCENT",
            "discount_value": "5",
        },
        headers=headers,
    )
    assert create_promotion.status_code == 201

    response = await client.get("/reports/marketing/dashboard-summary", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_campaigns_count"] == 1
    assert payload["active_promotions_count"] == 1
    assert float(payload["stock_valuation_total"]) > 0
    assert isinstance(payload["low_turnover_candidates_count"], int)
    assert isinstance(payload["top_skus_by_value"], list)
