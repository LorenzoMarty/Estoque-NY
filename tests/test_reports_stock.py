import pytest

from tests.helpers import create_branch, create_sku, receipt, register_and_login


async def _issue(client, headers, branch_id, location_id, sku_id, qty):
    response = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        },
        headers=headers,
    )
    assert response.status_code == 201


async def _scenario(client):
    """One branch, two SKUs: A gets 100 and issues 40; B gets 10 and issues 1."""
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_a = await create_sku(client, headers, sku_code="REP-A")
    sku_b = await create_sku(client, headers, sku_code="REP-B")
    for sku_id, qty in ((sku_a, 100), (sku_b, 10)):
        assert (
            await receipt(client, headers, branch_id, location_id, sku_id, qty)
        ).status_code == 201
    await _issue(client, headers, branch_id, location_id, sku_a, 40)
    await _issue(client, headers, branch_id, location_id, sku_b, 1)
    return headers, branch_id, location_id, sku_a, sku_b


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["valuation", "turnover", "movements", "abc"])
async def test_stock_reports_require_auth(client, path):
    assert (await client.get(f"/reports/stock/{path}")).status_code == 401


@pytest.mark.asyncio
async def test_valuation_multiplies_on_hand_by_cost(client):
    headers, branch_id, _, sku_a, sku_b = await _scenario(client)

    response = await client.get(
        f"/reports/stock/valuation?branch_id={branch_id}", headers=headers
    )

    assert response.status_code == 200
    by_sku = {item["sku_id"]: item for item in response.json()["items"]}
    assert by_sku[sku_a]["on_hand"] == 60
    assert float(by_sku[sku_a]["valuation"]) == 600.0  # 60 x cost 10.00
    assert float(by_sku[sku_b]["valuation"]) == 90.0  # 9 x cost 10.00
    # ordered by valuation, largest first
    assert response.json()["items"][0]["sku_id"] == sku_a


@pytest.mark.asyncio
async def test_valuation_filters_by_sku(client):
    headers, _, _, _, sku_b = await _scenario(client)

    response = await client.get(
        f"/reports/stock/valuation?sku_id={sku_b}", headers=headers
    )

    assert [item["sku_id"] for item in response.json()["items"]] == [sku_b]


@pytest.mark.asyncio
async def test_turnover_divides_issued_by_current_stock(client):
    headers, branch_id, _, sku_a, _ = await _scenario(client)

    response = await client.get(
        f"/reports/stock/turnover?branch_id={branch_id}", headers=headers
    )

    assert response.status_code == 200
    row = next(i for i in response.json()["items"] if i["sku_id"] == sku_a)
    assert row["issued_qty"] == 40
    assert row["turnover"] == pytest.approx(40 / 60)


@pytest.mark.asyncio
async def test_movements_lists_and_filters_by_type(client):
    headers, branch_id, _, _, _ = await _scenario(client)

    everything = await client.get(
        f"/reports/stock/movements?branch_id={branch_id}", headers=headers
    )
    issues = await client.get(
        f"/reports/stock/movements?branch_id={branch_id}&move_type=ISSUE",
        headers=headers,
    )

    assert everything.json()["meta"]["total"] == 4
    assert issues.json()["meta"]["total"] == 2
    assert {i["move_type"] for i in issues.json()["items"]} == {"ISSUE"}


@pytest.mark.asyncio
async def test_movements_exports_csv(client):
    headers, branch_id, _, _, _ = await _scenario(client)

    response = await client.get(
        f"/reports/stock/movements?branch_id={branch_id}&export=csv", headers=headers
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "stock_movements.csv" in response.headers["content-disposition"]
    lines = response.text.strip().splitlines()
    assert lines[0].split(",")[:3] == ["id", "branch_id", "location_id"]
    assert len(lines) == 5  # header + 4 moves


@pytest.mark.asyncio
async def test_movements_csv_is_empty_when_nothing_matches(client):
    headers = await register_and_login(client)

    response = await client.get("/reports/stock/movements?export=csv", headers=headers)

    assert response.status_code == 200
    assert response.text == ""


@pytest.mark.asyncio
async def test_abc_classifies_by_cumulative_issued_value(client):
    headers, branch_id, _, sku_a, sku_b = await _scenario(client)

    response = await client.get(
        f"/reports/stock/abc?branch_id={branch_id}", headers=headers
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert [i["sku_id"] for i in items] == [sku_a, sku_b]  # 400 vs 10 issued value
    assert items[-1]["cumulative_percent"] == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_stock_reports_paginate(client):
    headers, branch_id, _, _, _ = await _scenario(client)

    page = await client.get(
        f"/reports/stock/valuation?branch_id={branch_id}&page=2&page_size=1",
        headers=headers,
    )

    assert page.status_code == 200
    assert len(page.json()["items"]) == 1
    assert page.json()["meta"]["total"] == 2
