from datetime import timedelta

import pytest

from app.domain.lots import today_local
from tests.helpers import create_branch, create_sku, on_hand, register_and_login

pytestmark = pytest.mark.asyncio


async def _supplier(client, headers, name="Fornecedor A", **extra):
    resp = await client.post(
        "/stock/suppliers", json={"name": name, **extra}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _setup(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_a = await create_sku(client, headers, sku_code="PO-A")  # cost 10.00
    sku_b = await create_sku(client, headers, sku_code="PO-B")
    supplier_id = await _supplier(client, headers)
    return headers, branch_id, location_id, sku_a, sku_b, supplier_id


async def _order(client, headers, setup, lines=None, **extra):
    _, branch_id, location_id, sku_a, sku_b, supplier_id = setup
    body = {
        "supplier_id": supplier_id,
        "branch_id": branch_id,
        "location_id": location_id,
        "items": lines
        or [
            {"sku_id": sku_a, "qty": 10, "unit_cost": "20.00"},
            {"sku_id": sku_b, "qty": 4},
        ],
        **extra,
    }
    resp = await client.post("/stock/purchase-orders", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _receive(client, headers, order_id, lines, **extra):
    return await client.post(
        f"/stock/purchase-orders/{order_id}/receive",
        json={"items": lines, **extra},
        headers=headers,
    )


async def test_supplier_crud_and_unique_name(client):
    headers = await register_and_login(client)
    supplier_id = await _supplier(
        client, headers, "  Café   Brasil ", phone=" 11 9999 "
    )

    got = (await client.get(f"/stock/suppliers/{supplier_id}", headers=headers)).json()
    assert (got["name"], got["phone"], got["active"]) == (
        "Café Brasil",
        "11 9999",
        True,
    )

    dup = await client.post(
        "/stock/suppliers", json={"name": "Café Brasil"}, headers=headers
    )
    assert dup.status_code == 409

    edited = await client.put(
        f"/stock/suppliers/{supplier_id}",
        json={"name": "Café Brasil Ltda", "active": False},
        headers=headers,
    )
    assert edited.status_code == 200 and edited.json()["active"] is False

    found = await client.get("/stock/suppliers", params={"q": "ltda"}, headers=headers)
    assert [s["name"] for s in found.json()["items"]] == ["Café Brasil Ltda"]
    assert (
        await client.delete(f"/stock/suppliers/{supplier_id}", headers=headers)
    ).status_code == 204
    assert (
        await client.get(f"/stock/suppliers/{supplier_id}", headers=headers)
    ).status_code == 404


async def test_receiving_partially_then_fully_updates_stock_and_status(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_a, sku_b, _ = setup
    order = await _order(client, headers, setup)
    assert order["status"] == "OPEN"
    assert [i["qty_outstanding"] for i in order["items"]] == [10, 4]

    first = await _receive(client, headers, order["id"], [{"sku_id": sku_a, "qty": 6}])
    assert first.status_code == 200
    body = first.json()
    assert body["status"] == "PARTIAL"
    assert {
        i["sku_id"]: (i["qty_received"], i["qty_outstanding"]) for i in body["items"]
    } == {
        sku_a: (6, 4),
        sku_b: (0, 4),
    }
    assert await on_hand(client, headers, branch_id, sku_a) == 6
    assert await on_hand(client, headers, branch_id, sku_b) == 0

    second = await _receive(
        client,
        headers,
        order["id"],
        [{"sku_id": sku_a, "qty": 4}, {"sku_id": sku_b, "qty": 4}],
    )
    assert second.json()["status"] == "RECEIVED"
    assert await on_hand(client, headers, branch_id, sku_a) == 10
    assert await on_hand(client, headers, branch_id, sku_b) == 4


async def test_cannot_over_receive_and_a_bad_delivery_moves_nothing(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_a, sku_b, _ = setup
    order = await _order(client, headers, setup)

    over = await _receive(
        client,
        headers,
        order["id"],
        [{"sku_id": sku_b, "qty": 2}, {"sku_id": sku_a, "qty": 11}],
    )
    assert over.status_code == 409 and "only 10 outstanding" in over.text
    assert await on_hand(client, headers, branch_id, sku_b) == 0  # all or nothing

    stranger = await create_sku(client, headers, sku_code="PO-X")
    off_order = await _receive(
        client, headers, order["id"], [{"sku_id": stranger, "qty": 1}]
    )
    assert off_order.status_code == 400

    done = await _receive(
        client,
        headers,
        order["id"],
        [{"sku_id": sku_a, "qty": 10}, {"sku_id": sku_b, "qty": 4}],
    )
    assert done.json()["status"] == "RECEIVED"
    again = await _receive(client, headers, order["id"], [{"sku_id": sku_a, "qty": 1}])
    assert again.status_code == 409 and "received" in again.text


async def test_supplier_shows_on_the_movement_history(client):
    setup = await _setup(client)
    headers, _, _, sku_a, _, supplier_id = setup
    order = await _order(client, headers, setup)
    await _receive(client, headers, order["id"], [{"sku_id": sku_a, "qty": 3}])

    moves = (await client.get("/stock/moves?page_size=50", headers=headers)).json()[
        "items"
    ]

    receipt = next(m for m in moves if m["purchase_order_id"] == order["id"])
    assert (receipt["supplier_id"], receipt["supplier_name"]) == (
        supplier_id,
        "Fornecedor A",
    )
    assert receipt["move_type"] == "RECEIPT" and receipt["qty"] == 3


async def test_receiving_applies_the_agreed_cost_and_lots(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_a, _, _ = setup
    order = await _order(client, headers, setup)
    day = str(today_local() + timedelta(days=45))

    resp = await _receive(
        client,
        headers,
        order["id"],
        [{"sku_id": sku_a, "qty": 5, "lot_code": "FORN-1", "expires_on": day}],
    )
    assert resp.status_code == 200

    skus = (
        await client.get("/catalog/skus", params={"page_size": 50}, headers=headers)
    ).json()
    cost = next(s["cost"] for s in skus["items"] if s["id"] == sku_a)
    assert cost == "20.00"  # no stock before, so the agreed price becomes the cost
    lots = (await client.get("/stock/lots", headers=headers)).json()["items"]
    assert [(lot["code"], lot["on_hand"], lot["expires_on"]) for lot in lots] == [
        ("FORN-1", 5, day)
    ]


async def test_cancel_keeps_what_arrived_and_blocks_further_receiving(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_a, _, _ = setup
    order = await _order(client, headers, setup)
    await _receive(client, headers, order["id"], [{"sku_id": sku_a, "qty": 4}])

    cancelled = await client.post(
        f"/stock/purchase-orders/{order['id']}/cancel", headers=headers
    )
    assert cancelled.json()["status"] == "CANCELLED"
    assert await on_hand(client, headers, branch_id, sku_a) == 4

    later = await _receive(client, headers, order["id"], [{"sku_id": sku_a, "qty": 1}])
    assert later.status_code == 409
    twice = await client.post(
        f"/stock/purchase-orders/{order['id']}/cancel", headers=headers
    )
    assert twice.status_code == 409


async def test_order_validation(client):
    setup = await _setup(client)
    headers, branch_id, _, sku_a, _, supplier_id = setup
    post = lambda **body: client.post(  # noqa: E731
        "/stock/purchase-orders",
        json={"supplier_id": supplier_id, "branch_id": branch_id, **body},
        headers=headers,
    )

    assert (await post(items=[])).status_code == 400
    dupes = [{"sku_id": sku_a, "qty": 1}, {"sku_id": sku_a, "qty": 2}]
    assert (await post(items=dupes)).status_code == 400
    assert (await post(items=[{"sku_id": sku_a, "qty": 0}])).status_code == 400
    assert (await post(items=[{"sku_id": 9999, "qty": 1}])).status_code == 404
    assert (
        await client.post(
            "/stock/purchase-orders",
            json={
                "supplier_id": 9999,
                "branch_id": branch_id,
                "items": [{"sku_id": sku_a, "qty": 1}],
            },
            headers=headers,
        )
    ).status_code == 404

    await client.put(
        f"/stock/suppliers/{supplier_id}",
        json={"name": "Fornecedor A", "active": False},
        headers=headers,
    )
    inactive = await post(items=[{"sku_id": sku_a, "qty": 1}])
    assert inactive.status_code == 409 and "inactive" in inactive.text


async def test_supplier_with_orders_cannot_be_deleted(client):
    setup = await _setup(client)
    headers, *_, supplier_id = setup
    await _order(client, headers, setup)

    resp = await client.delete(f"/stock/suppliers/{supplier_id}", headers=headers)

    assert resp.status_code == 409 and "deactivate" in resp.text


async def test_list_and_filter_purchase_orders(client):
    setup = await _setup(client)
    headers, _, _, sku_a, _, supplier_id = setup
    first = await _order(client, headers, setup, reference="PO-001")
    second = await _order(client, headers, setup, reference="PO-002")
    await client.post(f"/stock/purchase-orders/{second['id']}/cancel", headers=headers)

    everything = (await client.get("/stock/purchase-orders", headers=headers)).json()
    assert {o["id"] for o in everything["items"]} == {first["id"], second["id"]}
    open_only = (
        await client.get(
            "/stock/purchase-orders", params={"status": "OPEN"}, headers=headers
        )
    ).json()
    assert [o["reference"] for o in open_only["items"]] == ["PO-001"]
    by_ref = (
        await client.get("/stock/purchase-orders", params={"q": "002"}, headers=headers)
    ).json()
    assert [o["id"] for o in by_ref["items"]] == [second["id"]]


async def test_purchasing_requires_auth(client):
    assert (await client.get("/stock/suppliers")).status_code == 401
    assert (await client.get("/stock/purchase-orders")).status_code == 401


async def test_a_name_only_update_keeps_the_other_supplier_fields(client):
    headers = await register_and_login(client)
    supplier_id = await _supplier(
        client, headers, "Antigo", phone="11 9999", email="a@b.com", tax_id="123"
    )

    resp = await client.put(
        f"/stock/suppliers/{supplier_id}", json={"name": "Novo"}, headers=headers
    )

    body = resp.json()
    assert (body["name"], body["phone"], body["email"], body["tax_id"]) == (
        "Novo",
        "11 9999",
        "a@b.com",
        "123",
    )
