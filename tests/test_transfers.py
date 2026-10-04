import pytest

from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)


async def _setup(client, *, stock: int = 10):
    headers = await register_and_login(client)
    origin_branch, origin_location = await create_branch(client, headers, "Origem")
    dest_branch, dest_location = await create_branch(client, headers, "Destino")
    sku_id = await create_sku(client, headers)
    if stock:
        response = await receipt(
            client, headers, origin_branch, origin_location, sku_id, stock
        )
        assert response.status_code == 201
    return headers, origin_branch, origin_location, dest_branch, dest_location, sku_id


async def _create_transfer(client, headers, setup, qty=4):
    _, origin_branch, origin_location, dest_branch, dest_location, sku_id = setup
    response = await client.post(
        "/stock/transfers",
        json={
            "from_branch_id": origin_branch,
            "from_location_id": origin_location,
            "to_branch_id": dest_branch,
            "to_location_id": dest_location,
            "items": [{"sku_id": sku_id, "qty": qty}],
        },
        headers=headers,
    )
    return response


@pytest.mark.asyncio
async def test_transfer_happy_path_moves_stock_between_branches(client):
    setup = await _setup(client)
    headers, origin_branch, _, dest_branch, _, sku_id = setup

    created = await _create_transfer(client, headers, setup, qty=4)
    assert created.status_code == 201
    transfer_id = created.json()["id"]
    assert created.json()["status"] == "DRAFT"
    assert await on_hand(client, headers, origin_branch, sku_id) == 10

    shipped = await client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
    assert shipped.status_code == 200
    assert shipped.json()["status"] == "SHIPPED"
    assert shipped.json()["shipped_at"] is not None
    assert await on_hand(client, headers, origin_branch, sku_id) == 6
    assert await on_hand(client, headers, dest_branch, sku_id) == 0

    received = await client.post(
        f"/stock/transfers/{transfer_id}/receive", headers=headers
    )
    assert received.status_code == 200
    assert received.json()["status"] == "RECEIVED"
    assert received.json()["received_at"] is not None
    assert await on_hand(client, headers, origin_branch, sku_id) == 6
    assert await on_hand(client, headers, dest_branch, sku_id) == 4


@pytest.mark.asyncio
async def test_transfer_invalid_transitions_are_rejected(client):
    setup = await _setup(client)
    headers = setup[0]

    transfer_id = (await _create_transfer(client, headers, setup)).json()["id"]
    base = f"/stock/transfers/{transfer_id}"

    receive_draft = await client.post(f"{base}/receive", headers=headers)
    assert receive_draft.status_code == 422

    assert (await client.post(f"{base}/ship", headers=headers)).status_code == 200
    ship_again = await client.post(f"{base}/ship", headers=headers)
    assert ship_again.status_code == 422

    cancel_shipped = await client.post(f"{base}/cancel", headers=headers)
    assert cancel_shipped.status_code == 422

    assert (await client.post(f"{base}/receive", headers=headers)).status_code == 200
    receive_again = await client.post(f"{base}/receive", headers=headers)
    assert receive_again.status_code == 422
    cancel_received = await client.post(f"{base}/cancel", headers=headers)
    assert cancel_received.status_code == 422


@pytest.mark.asyncio
async def test_cancel_draft_transfer_and_cancel_twice(client):
    setup = await _setup(client)
    headers, origin_branch, _, _, _, sku_id = setup

    transfer_id = (await _create_transfer(client, headers, setup)).json()["id"]
    base = f"/stock/transfers/{transfer_id}"

    cancelled = await client.post(f"{base}/cancel", headers=headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    assert await on_hand(client, headers, origin_branch, sku_id) == 10

    assert (await client.post(f"{base}/cancel", headers=headers)).status_code == 422
    assert (await client.post(f"{base}/ship", headers=headers)).status_code == 422


@pytest.mark.asyncio
async def test_ship_without_enough_stock_fails_and_keeps_draft(client):
    setup = await _setup(client, stock=2)
    headers, origin_branch, _, _, _, sku_id = setup

    transfer_id = (await _create_transfer(client, headers, setup, qty=5)).json()["id"]
    shipped = await client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
    assert shipped.status_code == 409

    current = await client.get(f"/stock/transfers/{transfer_id}", headers=headers)
    assert current.json()["status"] == "DRAFT"
    assert await on_hand(client, headers, origin_branch, sku_id) == 2


@pytest.mark.asyncio
async def test_create_transfer_validations(client):
    setup = await _setup(client)
    headers, origin_branch, origin_location, dest_branch, dest_location, sku_id = setup

    async def post(**overrides):
        payload = {
            "from_branch_id": origin_branch,
            "from_location_id": origin_location,
            "to_branch_id": dest_branch,
            "to_location_id": dest_location,
            "items": [{"sku_id": sku_id, "qty": 1}],
            **overrides,
        }
        return await client.post("/stock/transfers", json=payload, headers=headers)

    assert (await post(items=[])).status_code == 400
    assert (await post(items=[{"sku_id": sku_id, "qty": 0}])).status_code == 400
    same = await post(to_branch_id=origin_branch, to_location_id=origin_location)
    assert same.status_code == 400
    wrong_location = await post(from_location_id=dest_location)
    assert wrong_location.status_code == 404
