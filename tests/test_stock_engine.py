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


@pytest.mark.asyncio
async def test_purge_expired_idempotency_keys_keeps_recent_ones(client):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.models.entities import IdempotencyKey
    from app.services.idempotency_service import purge_expired_idempotency_keys

    old = datetime.now(UTC) - timedelta(hours=48)
    async with get_sessionmaker()() as session:
        for key, created in (("old", old), ("recent", datetime.now(UTC))):
            session.add(
                IdempotencyKey(
                    key=key,
                    route="POST:/x",
                    request_hash="h",
                    response_body={},
                    status_code=201,
                    created_at=created,
                )
            )
        await session.commit()

    assert await purge_expired_idempotency_keys() == 1
    async with get_sessionmaker()() as session:
        assert list(await session.scalars(select(IdempotencyKey.key))) == ["recent"]


def test_idempotency_ttl_must_be_at_least_one_hour(monkeypatch):
    from pydantic import ValidationError

    from app.core.config import Settings

    monkeypatch.setenv("IDEMPOTENCY_TTL_HOURS", "0")
    with pytest.raises(ValidationError):
        Settings()


async def _cost(client, headers, sku_id) -> str:
    resp = await client.get("/catalog/skus", params={"page_size": 200}, headers=headers)
    return next(s["cost"] for s in resp.json()["items"] if s["id"] == sku_id)


@pytest.mark.asyncio
async def test_receipts_with_unit_cost_move_the_sku_cost_to_the_moving_average(client):
    headers, branch_id, location_id, sku_id = await _setup(client)  # cost starts 10.00

    async def receive(qty, unit_cost=None):
        body = {
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        }
        if unit_cost is not None:
            body["unit_cost"] = unit_cost
        resp = await client.post("/stock/receipts", json=body, headers=headers)
        assert resp.status_code == 201, resp.text

    await receive(10)  # no unit_cost: cost untouched
    assert await _cost(client, headers, sku_id) == "10.00"
    await receive(10, "20.00")  # (10*10 + 10*20) / 20
    assert await _cost(client, headers, sku_id) == "15.00"
    await receive(5, "30.00")  # (20*15 + 5*30) / 25
    assert await _cost(client, headers, sku_id) == "18.00"


def test_moving_average_cost_edges():
    from decimal import Decimal

    from app.domain.stock_engine import moving_average_cost

    d = Decimal
    assert moving_average_cost(0, d("10"), 4, d("7.5")) == d("7.50")  # empty stock
    assert moving_average_cost(-3, d("10"), 4, d("7.5")) == d("7.50")  # negative stock
    assert moving_average_cost(3, d("10.00"), 1, d("11")) == d("10.25")
    assert moving_average_cost(1, d("1.00"), 2, d("1.01")) == d("1.01")  # rounds
