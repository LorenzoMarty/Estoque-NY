from datetime import date, timedelta

import pytest

from app import jobs
from app.core.db import get_sessionmaker
from app.models.entities import StockThreshold
from app.services import low_stock_service
from tests.helpers import create_branch, create_sku, receipt, register_and_login

pytestmark = pytest.mark.asyncio


async def _set(client, headers, branch_id, sku_id, min_qty, max_qty=None):
    return await client.put(
        "/stock/thresholds",
        json={
            "branch_id": branch_id,
            "sku_id": sku_id,
            "min_qty": min_qty,
            "max_qty": max_qty,
        },
        headers=headers,
    )


async def _low(client, headers, **params):
    resp = await client.get("/stock/low-stock", params=params, headers=headers)
    assert resp.status_code == 200
    return resp.json()["items"]


async def test_sku_below_minimum_is_listed_and_leaves_when_restocked(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-1")
    assert (await _set(client, headers, branch_id, sku_id, 10, 50)).status_code == 200
    await receipt(client, headers, branch_id, location_id, sku_id, 4)

    items = await _low(client, headers)
    assert [
        (i["sku_code"], i["on_hand"], i["min_qty"], i["missing"]) for i in items
    ] == [("LOW-1", 4, 10, 6)]

    await receipt(client, headers, branch_id, location_id, sku_id, 6)  # now 10 = min
    assert await _low(client, headers) == []


async def test_sku_without_any_balance_counts_as_zero(client):
    headers = await register_and_login(client)
    branch_id, _ = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-0")
    await _set(client, headers, branch_id, sku_id, 3)

    assert [i["on_hand"] for i in await _low(client, headers)] == [0]


async def test_zero_minimum_disables_the_alert_and_upsert_updates_in_place(client):
    headers = await register_and_login(client)
    branch_id, _ = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-2")
    first = await _set(client, headers, branch_id, sku_id, 5)
    second = await _set(client, headers, branch_id, sku_id, 0)

    assert first.json()["id"] == second.json()["id"]
    assert await _low(client, headers) == []
    listed = await client.get("/stock/thresholds", headers=headers)
    assert [t["min_qty"] for t in listed.json()["items"]] == [0]


async def test_max_below_min_is_rejected(client):
    headers = await register_and_login(client)
    branch_id, _ = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-3")

    assert (await _set(client, headers, branch_id, sku_id, 10, 5)).status_code == 400
    assert (await _set(client, headers, 999, sku_id, 1)).status_code == 404


async def test_archived_sku_is_not_reported(client):
    headers = await register_and_login(client)
    branch_id, _ = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-4")
    await _set(client, headers, branch_id, sku_id, 5)
    await client.post(f"/catalog/skus/{sku_id}/archive", json={}, headers=headers)

    assert await _low(client, headers) == []


async def test_low_stock_requires_auth(client):
    assert (await client.get("/stock/low-stock")).status_code == 401


async def test_alert_runs_once_per_day_and_again_the_next_day(client, monkeypatch):
    headers = await register_and_login(client)
    branch_id, _ = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="LOW-5")
    await _set(client, headers, branch_id, sku_id, 5)
    sent = []

    async def fake_email(subject, body):
        sent.append((subject, body))
        return True

    monkeypatch.setattr(low_stock_service, "send_email", fake_email)
    today = date(2026, 10, 24)

    assert await low_stock_service.send_low_stock_alert(today) == 1
    assert await low_stock_service.send_low_stock_alert(today) == 0  # same day
    assert len(sent) == 1 and "LOW-5" in sent[0][1] and "faltam 5" in sent[0][1]

    assert await low_stock_service.send_low_stock_alert(today + timedelta(days=1)) == 1
    assert len(sent) == 2

    async with get_sessionmaker()() as session:
        threshold = await session.get(StockThreshold, 1)
        assert threshold.last_alert_on == today + timedelta(days=1)


async def test_alert_job_is_registered():
    assert "low_stock_alert" in jobs.JOBS


async def test_email_is_skipped_without_smtp(client):
    from app.core.notify import send_email

    assert await send_email("subject", "body") is False
