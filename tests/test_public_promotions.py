from datetime import UTC, datetime, timedelta

import pytest

from tests.helpers import register_and_login
from tests.test_public_catalog import _product, _publish, _sku

pytestmark = pytest.mark.asyncio

V1 = "/public/v1/catalog"


async def _offer(client, headers, sku_id, **extra):
    payload = {
        "name": "Promo",
        "status": "ACTIVE",
        "discount_type": "PERCENT",
        "discount_value": "25",
        "sku_ids": [sku_id],
        **extra,
    }
    response = await client.post("/marketing/promotions", json=payload, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


async def _setup(client):
    headers = await register_and_login(client)
    product_id = await _product(client, headers, "Alfa")
    sku_id = await _sku(client, headers, product_id, "S-A", price="20.00")
    await _publish(client, headers, product_id)
    return headers, sku_id


async def _promotion(client):
    body = (await client.get(V1)).json()
    return body["sectors"][0]["products"][0]["promotion"]


async def test_active_percent_promotion_exposes_discounted_price(client):
    headers, sku_id = await _setup(client)
    await _offer(client, headers, sku_id)

    promo = await _promotion(client)

    assert promo["name"] == "Promo"
    assert promo["price_usd"] == "15.00"
    assert promo["discount_type"] == "PERCENT"


async def test_fixed_discount_never_goes_below_zero(client):
    headers, sku_id = await _setup(client)
    await _offer(client, headers, sku_id, discount_type="FIXED", discount_value="99")

    assert (await _promotion(client))["price_usd"] == "0.00"


async def test_custom_discount_has_no_computed_price(client):
    headers, sku_id = await _setup(client)
    await _offer(client, headers, sku_id, discount_type="CUSTOM", discount_value=None)

    assert (await _promotion(client))["price_usd"] is None


async def test_draft_expired_and_future_promotions_are_hidden(client):
    headers, sku_id = await _setup(client)
    now = datetime.now(UTC)
    await _offer(client, headers, sku_id, status="DRAFT")
    await _offer(client, headers, sku_id, ends_at=(now - timedelta(days=1)).isoformat())
    await _offer(
        client, headers, sku_id, starts_at=(now + timedelta(days=1)).isoformat()
    )

    assert await _promotion(client) is None
