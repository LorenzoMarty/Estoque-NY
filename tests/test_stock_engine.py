import pytest

from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)


async def _setup(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers)
    return headers, branch_id, location_id, sku_id


@pytest.mark.asyncio
async def test_receipt_and_issue_update_balance(client):
    headers, branch_id, location_id, sku_id = await _setup(client)

    response = await receipt(client, headers, branch_id, location_id, sku_id, 10)
    assert response.status_code == 201
    assert response.json()["balance_after"] == 10

    issue = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": 4,
        },
        headers=headers,
    )
    assert issue.status_code == 201
    assert issue.json()["balance_after"] == 6
    assert issue.json()["qty"] == -4
    assert await on_hand(client, headers, branch_id, sku_id) == 6


@pytest.mark.asyncio
async def test_issue_beyond_stock_is_rejected_and_balance_unchanged(client):
    headers, branch_id, location_id, sku_id = await _setup(client)
    await receipt(client, headers, branch_id, location_id, sku_id, 3)

    issue = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": 4,
        },
        headers=headers,
    )
    assert issue.status_code == 409
    assert "insufficient stock" in issue.json()["error"]["message"]
    assert await on_hand(client, headers, branch_id, sku_id) == 3


@pytest.mark.asyncio
async def test_adjustment_rejects_zero_and_negative_below_zero(client):
    headers, branch_id, location_id, sku_id = await _setup(client)
    await receipt(client, headers, branch_id, location_id, sku_id, 2)

    base = {"branch_id": branch_id, "location_id": location_id, "sku_id": sku_id}
    zero = await client.post(
        "/stock/adjustments", json={**base, "qty_delta": 0}, headers=headers
    )
    assert zero.status_code == 400

    below = await client.post(
        "/stock/adjustments", json={**base, "qty_delta": -3}, headers=headers
    )
    assert below.status_code == 409

    ok = await client.post(
        "/stock/adjustments", json={**base, "qty_delta": -2}, headers=headers
    )
    assert ok.status_code == 201
    assert await on_hand(client, headers, branch_id, sku_id) == 0


@pytest.mark.asyncio
async def test_move_of_inactive_sku_is_rejected(client):
    headers, branch_id, location_id, sku_id = await _setup(client)
    patch = await client.patch(
        f"/catalog/skus/{sku_id}", json={"active": False}, headers=headers
    )
    assert patch.status_code == 200

    response = await receipt(client, headers, branch_id, location_id, sku_id, 1)
    assert response.status_code == 422
    assert "inactive sku" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_unknown_branch_and_sku_return_not_found(client):
    headers, branch_id, location_id, sku_id = await _setup(client)

    bad_branch = await receipt(client, headers, 9999, location_id, sku_id, 1)
    assert bad_branch.status_code == 404

    bad_sku = await receipt(client, headers, branch_id, location_id, 9999, 1)
    assert bad_sku.status_code == 404


@pytest.mark.asyncio
async def test_location_is_required_when_branch_has_several(client):
    headers, branch_id, _location_id, sku_id = await _setup(client)
    second = await client.post(
        "/locations",
        json={"branch_id": branch_id, "name": "Loja", "type": "STORE"},
        headers=headers,
    )
    assert second.status_code == 201

    response = await client.post(
        "/stock/receipts",
        json={"branch_id": branch_id, "sku_id": sku_id, "qty": 1},
        headers=headers,
    )
    assert response.status_code == 400
    assert "location_id is required" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_idempotency_key_replays_without_double_applying(client):
    headers, branch_id, location_id, sku_id = await _setup(client)
    key = {"Idempotency-Key": "receipt-1"}

    first = await receipt(client, headers, branch_id, location_id, sku_id, 5, **key)
    assert first.status_code == 201
    second = await receipt(client, headers, branch_id, location_id, sku_id, 5, **key)
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert await on_hand(client, headers, branch_id, sku_id) == 5

    different = await receipt(client, headers, branch_id, location_id, sku_id, 7, **key)
    assert different.status_code == 409
    assert await on_hand(client, headers, branch_id, sku_id) == 5
