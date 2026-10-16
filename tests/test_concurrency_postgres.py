"""Concurrent stock writes against real Postgres (SQLite has no row locks).

Each test fires its requests at the same moment with asyncio.gather; the connection
pool lets several run in different transactions at once, so the row locks in
stock_engine / transfer_service are what keeps the balance consistent.
"""

import asyncio
import os

import pytest
from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.models.entities import StockBalance, StockMove
from app.models.enums import MoveType
from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)

pytestmark = pytest.mark.skipif(
    not os.environ.get("TEST_DATABASE_URL", "").startswith("postgres"),
    reason="needs TEST_DATABASE_URL pointing to Postgres",
)


async def _issue(client, headers, branch_id, location_id, sku_id, qty=1):
    return await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        },
        headers=headers,
    )


async def _setup(client, initial):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers)
    if initial:
        assert (
            await receipt(client, headers, branch_id, location_id, sku_id, initial)
        ).status_code == 201
    return headers, branch_id, location_id, sku_id


async def _move_count(move_type: MoveType) -> int:
    async with get_sessionmaker()() as session:
        return int(
            await session.scalar(
                select(func.count())
                .select_from(StockMove)
                .where(StockMove.move_type == move_type)
            )
            or 0
        )


@pytest.mark.asyncio
async def test_100_concurrent_issues_never_overdraw_the_balance(client):
    headers, branch_id, location_id, sku_id = await _setup(client, initial=60)

    responses = await asyncio.gather(
        *[_issue(client, headers, branch_id, location_id, sku_id) for _ in range(100)]
    )

    statuses = [r.status_code for r in responses]
    assert statuses.count(201) == 60  # exactly the stock that existed
    assert statuses.count(409) == 40  # the rest are refused, never a 500
    assert set(statuses) == {201, 409}
    assert await on_hand(client, headers, branch_id, sku_id) == 0
    assert await _move_count(MoveType.ISSUE) == 60  # no lost or duplicated move


@pytest.mark.asyncio
async def test_concurrent_receipts_and_issues_keep_the_arithmetic(client):
    headers, branch_id, location_id, sku_id = await _setup(client, initial=100)

    calls = [
        receipt(client, headers, branch_id, location_id, sku_id, 1) for _ in range(50)
    ] + [_issue(client, headers, branch_id, location_id, sku_id) for _ in range(50)]
    responses = await asyncio.gather(*calls)

    assert {r.status_code for r in responses} == {201}
    assert await on_hand(client, headers, branch_id, sku_id) == 100  # 100 + 50 - 50
    assert await _move_count(MoveType.RECEIPT) == 51  # 50 + the initial one
    assert await _move_count(MoveType.ISSUE) == 50


@pytest.mark.asyncio
async def test_first_movements_race_on_a_balance_that_does_not_exist_yet(client):
    headers, branch_id, location_id, sku_id = await _setup(client, initial=0)

    responses = await asyncio.gather(
        *[
            receipt(client, headers, branch_id, location_id, sku_id, 1)
            for _ in range(20)
        ]
    )

    assert {r.status_code for r in responses} == {201}
    assert await on_hand(client, headers, branch_id, sku_id) == 20
    async with get_sessionmaker()() as session:
        rows = await session.scalar(
            select(func.count())
            .select_from(StockBalance)
            .where(StockBalance.sku_id == sku_id)
        )
    assert rows == 1  # ON CONFLICT DO NOTHING: one balance row, not 20


@pytest.mark.asyncio
async def test_shipping_the_same_transfer_twice_at_once_ships_it_once(client):
    headers, branch_id, location_id, sku_id = await _setup(client, initial=50)
    other_branch, other_location = await create_branch(client, headers, "Filial B")
    created = await client.post(
        "/stock/transfers",
        json={
            "from_branch_id": branch_id,
            "from_location_id": location_id,
            "to_branch_id": other_branch,
            "to_location_id": other_location,
            "items": [{"sku_id": sku_id, "qty": 5}],
        },
        headers=headers,
    )
    assert created.status_code == 201
    transfer_id = created.json()["id"]

    responses = await asyncio.gather(
        *[
            client.post(f"/stock/transfers/{transfer_id}/ship", headers=headers)
            for _ in range(10)
        ]
    )

    statuses = [r.status_code for r in responses]
    assert statuses.count(200) == 1
    assert all(s in {200, 409, 422} for s in statuses)
    assert (
        await on_hand(client, headers, branch_id, sku_id) == 45
    )  # shipped once, not 10 times
    assert await _move_count(MoveType.TRANSFER_SHIP) == 1
