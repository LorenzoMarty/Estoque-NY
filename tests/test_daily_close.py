from datetime import timedelta

import pytest

from app.domain.lots import today_local
from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)

pytestmark = pytest.mark.asyncio

URL = "/reports/sales/daily-close"


async def _setup(client):
    headers = await register_and_login(client)
    branch_id, loc = await create_branch(client, headers)
    sku_id = await create_sku(client, headers)
    await client.patch(f"/catalog/skus/{sku_id}", json={"price": "10"}, headers=headers)
    await receipt(client, headers, branch_id, loc, sku_id, 50)
    return headers, branch_id, sku_id


async def _sell(client, headers, branch_id, sku_id, qty, **extra):
    body = {"branch_id": branch_id, "items": [{"sku_id": sku_id, "qty": qty}]} | extra
    return await client.post("/sales", json=body, headers=headers)


async def _close(client, headers, branch_id, day):
    body = {"branch_id": branch_id, "day": day.isoformat()}
    return await client.post(URL, json=body, headers=headers)


async def test_report_sums_the_day_and_closing_locks_it(client):
    headers, branch_id, sku_id = await _setup(client)
    today = today_local()
    await _sell(client, headers, branch_id, sku_id, 2)
    voided = (await _sell(client, headers, branch_id, sku_id, 1)).json()["id"]
    await client.post(f"/sales/{voided}/void", json={"reason": "oops"}, headers=headers)
    params = {"branch_id": branch_id, "day": today.isoformat()}

    report = (await client.get(URL, params=params, headers=headers)).json()
    closed = await _close(client, headers, branch_id, today)
    again = await _close(client, headers, branch_id, today)

    assert report["sales_count"] == 1 and report["revenue"] == "20.00"
    assert report["units_sold"] == 2 and report["closed"] is False
    assert report["voided_count"] == 1 and report["voided_total"] == "10.00"
    assert closed.status_code == 201 and again.status_code == 409


async def test_closed_day_rejects_backdated_sales_without_override(client):
    headers, branch_id, sku_id = await _setup(client)
    today = today_local()
    await _close(client, headers, branch_id, today)
    older = f"{(today - timedelta(days=3)).isoformat()}T12:00:00-03:00"

    blocked = await _sell(client, headers, branch_id, sku_id, 1)
    other_day = await _sell(client, headers, branch_id, sku_id, 1, sold_at=older)
    override = await _sell(
        client, headers, branch_id, sku_id, 1, override_closed_day=True
    )

    assert blocked.status_code == 422, blocked.text
    assert "closed" in blocked.text
    assert other_day.status_code == 201
    assert override.status_code == 201
    assert await on_hand(client, headers, branch_id, sku_id) == 48
    logs = (await client.get("/admin/audit-logs", headers=headers)).text
    assert "override_closed_day" in logs


async def test_void_in_closed_day_needs_override_and_future_day_cannot_close(client):
    headers, branch_id, sku_id = await _setup(client)
    sale = (await _sell(client, headers, branch_id, sku_id, 1)).json()["id"]
    await _close(client, headers, branch_id, today_local())
    late = {"reason": "late"}

    blocked = await client.post(f"/sales/{sale}/void", json=late, headers=headers)
    allowed = await client.post(
        f"/sales/{sale}/void",
        json=late | {"override_closed_day": True},
        headers=headers,
    )
    future = today_local() + timedelta(days=2)
    too_early = await _close(client, headers, branch_id, future)

    assert blocked.status_code == 422 and allowed.status_code == 200
    assert too_early.status_code == 422
