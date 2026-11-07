import pytest

from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)

pytestmark = pytest.mark.asyncio


async def _count(client, headers, blind=False):
    branch, location = await create_branch(client, headers)
    sku = await create_sku(client, headers)
    assert (
        await receipt(client, headers, branch, location, sku, 10)
    ).status_code == 201
    created = await client.post(
        "/stock/inventory-counts",
        json={"branch_id": branch, "location_id": location, "blind": blind},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    return branch, sku, created.json()


async def _fill_close(client, headers, count_id, sku, qty):
    base = f"/stock/inventory-counts/{count_id}"
    r = await client.patch(
        f"{base}/lines",
        json={"lines": [{"sku_id": sku, "counted_qty": qty}]},
        headers=headers,
    )
    assert r.status_code == 200
    assert (await client.post(f"{base}/close", headers=headers)).status_code == 200
    return base


async def test_blind_count_hides_expected_qty_until_closed(client):
    headers = await register_and_login(client)
    _, sku, count = await _count(client, headers, blind=True)
    assert count["blind"] is True
    assert count["lines"][0]["system_qty"] is None
    assert count["lines"][0]["diff_qty"] is None

    base = await _fill_close(client, headers, count["id"], sku, 8)
    closed = (await client.get(base, headers=headers)).json()
    assert closed["lines"][0]["system_qty"] == 10
    assert closed["lines"][0]["diff_qty"] == -2


async def test_divergent_count_cannot_post_without_approval(client):
    headers = await register_and_login(client)
    branch, sku, count = await _count(client, headers)
    base = await _fill_close(client, headers, count["id"], sku, 8)

    blocked = await client.post(f"{base}/post", headers=headers)
    assert blocked.status_code == 422
    assert await on_hand(client, headers, branch, sku) == 10

    approved = await client.post(f"{base}/approve", headers=headers)
    assert approved.status_code == 200 and approved.json()["approved_at"]
    assert (await client.post(f"{base}/post", headers=headers)).status_code == 200
    assert await on_hand(client, headers, branch, sku) == 8


async def test_matching_count_posts_without_approval(client):
    headers = await register_and_login(client)
    _, sku, count = await _count(client, headers)
    base = await _fill_close(client, headers, count["id"], sku, 10)
    assert (await client.post(f"{base}/post", headers=headers)).status_code == 200


async def test_recount_reopens_divergent_lines_and_drops_approval(client):
    headers = await register_and_login(client)
    branch, sku, count = await _count(client, headers)
    base = await _fill_close(client, headers, count["id"], sku, 8)
    await client.post(f"{base}/approve", headers=headers)

    reopened = await client.post(f"{base}/recount", json={}, headers=headers)
    assert reopened.status_code == 200
    body = reopened.json()
    assert body["status"] == "OPEN" and body["approved_at"] is None
    assert body["lines"][0]["counted_qty"] is None

    await client.patch(
        f"{base}/lines",
        json={"lines": [{"sku_id": sku, "counted_qty": 10}]},
        headers=headers,
    )
    await client.post(f"{base}/close", headers=headers)
    assert (await client.post(f"{base}/post", headers=headers)).status_code == 200
    assert await on_hand(client, headers, branch, sku) == 10

    nothing = await client.post(f"{base}/recount", json={}, headers=headers)
    assert nothing.status_code == 422


async def test_approve_needs_a_closed_count(client):
    headers = await register_and_login(client)
    _, _, count = await _count(client, headers)
    r = await client.post(
        f"/stock/inventory-counts/{count['id']}/approve", headers=headers
    )
    assert r.status_code == 422
