import pytest

from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)

pytestmark = pytest.mark.asyncio


async def _setup(client, qty=10):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers)
    await client.patch(
        f"/catalog/skus/{sku_id}", json={"price": "12.50"}, headers=headers
    )
    if qty:
        await receipt(client, headers, branch_id, location_id, sku_id, qty)
    return headers, branch_id, location_id, sku_id


def _body(branch_id, sku_id, qty=3, **extra):
    return {"branch_id": branch_id, "items": [{"sku_id": sku_id, "qty": qty}]} | extra


async def _sell(client, headers, branch_id, sku_id, qty=3, **extra):
    body = _body(branch_id, sku_id, qty, **extra)
    return await client.post("/sales", json=body, headers=headers)


async def test_sale_issues_stock_and_prices_from_the_sku(client):
    headers, branch_id, _, sku_id = await _setup(client)

    resp = await _sell(client, headers, branch_id, sku_id)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total"] == "37.50" and body["status"] == "COMPLETED"
    assert body["items"][0]["issue_move_id"]
    assert await on_hand(client, headers, branch_id, sku_id) == 7


async def test_retry_with_same_key_does_not_duplicate_sale_or_stock(client):
    headers, branch_id, _, sku_id = await _setup(client)
    keyed = {**headers, "Idempotency-Key": "sale-1"}
    body = _body(branch_id, sku_id)

    first = await client.post("/sales", json=body, headers=keyed)
    again = await client.post("/sales", json=body, headers=keyed)

    assert first.status_code == again.status_code == 201
    assert first.json() == again.json()
    assert await on_hand(client, headers, branch_id, sku_id) == 7
    listing = await client.get("/sales", headers=headers)
    assert listing.json()["meta"]["total"] == 1


async def test_insufficient_stock_rolls_the_whole_sale_back(client):
    headers, branch_id, _, sku_id = await _setup(client, qty=5)
    body = {
        "branch_id": branch_id,
        "items": [{"sku_id": sku_id, "qty": 4}, {"sku_id": sku_id, "qty": 4}],
    }

    resp = await client.post("/sales", json=body, headers=headers)

    assert resp.status_code == 409
    assert await on_hand(client, headers, branch_id, sku_id) == 5
    assert (await client.get("/sales", headers=headers)).json()["meta"]["total"] == 0


async def test_void_restores_stock_once(client):
    headers, branch_id, _, sku_id = await _setup(client)
    sale = (await _sell(client, headers, branch_id, sku_id, 4)).json()
    url = f"/sales/{sale['id']}/void"

    voided = await client.post(url, json={"reason": "wrong item"}, headers=headers)
    again = await client.post(url, json={"reason": "wrong item"}, headers=headers)

    assert voided.status_code == 200 and voided.json()["status"] == "VOIDED"
    assert again.status_code == 422
    assert await on_hand(client, headers, branch_id, sku_id) == 10


async def test_void_returns_units_to_their_lot(client):
    headers, branch_id, location_id, sku_id = await _setup(client, qty=0)
    await client.post(
        "/stock/receipts",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": 5,
            "lot_code": "L1",
            "expires_on": "2030-01-01",
        },
        headers=headers,
    )
    sale = (await _sell(client, headers, branch_id, sku_id, 4)).json()
    url = f"/sales/{sale['id']}/void"
    await client.post(url, json={"reason": "oops"}, headers=headers)

    lots = (await client.get("/stock/lots", headers=headers)).json()["items"]

    assert [(lot["code"], lot["on_hand"]) for lot in lots] == [("L1", 5)]
    assert await on_hand(client, headers, branch_id, sku_id) == 5


async def test_customer_link_and_unknown_customer(client):
    headers, branch_id, _, sku_id = await _setup(client)
    created = await client.post("/customers", json={"name": "Ana"}, headers=headers)
    cid = created.json()["id"]

    ok = await _sell(client, headers, branch_id, sku_id, customer_id=cid)
    bad = await _sell(client, headers, branch_id, sku_id, customer_id=999)

    assert ok.json()["customer_id"] == cid
    assert bad.status_code == 404
    got = await client.get(f"/sales/{ok.json()['id']}", headers=headers)
    assert got.status_code == 200
