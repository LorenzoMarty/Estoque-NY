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


@pytest.mark.asyncio
async def test_margin_report_groups_stock_value_by_sku_category_and_branch(client):
    headers, branch_id, *_ = await _scenario(
        client
    )  # A: 60 units, B: 9; cost 10, price 20

    by_sku = (
        await client.get("/reports/stock/margin?group_by=sku", headers=headers)
    ).json()["items"]
    assert {
        r["name"]: (r["on_hand"], r["margin"], r["margin_pct"]) for r in by_sku
    } == {
        "REP-A": (60, "600.00", "50.00"),
        "REP-B": (9, "90.00", "50.00"),
    }

    by_category = (
        await client.get("/reports/stock/margin?group_by=category", headers=headers)
    ).json()["items"]
    assert [(r["name"], r["on_hand"], r["margin"]) for r in by_category] == [
        ("Sem categoria", 69, "690.00")
    ]

    by_branch = (
        await client.get(
            f"/reports/stock/margin?group_by=branch&branch_id={branch_id}",
            headers=headers,
        )
    ).json()["items"]
    assert [(r["group_id"], r["cost_value"], r["price_value"]) for r in by_branch] == [
        (branch_id, "690.00", "1380.00")
    ]


@pytest.mark.asyncio
async def test_margin_report_requires_auth_and_valid_group(client):
    assert (await client.get("/reports/stock/margin")).status_code == 401
    headers = await register_and_login(client)
    bad = await client.get("/reports/stock/margin?group_by=bogus", headers=headers)
    assert bad.status_code in (400, 422)


async def _tagged_scenario(client):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="SHR-1")  # cost 10.00
    await receipt(client, headers, branch_id, location_id, sku_id, 100)

    async def issue(qty, code=None):
        body = {
            "branch_id": branch_id,
            "location_id": location_id,
            "sku_id": sku_id,
            "qty": qty,
        }
        if code:
            body["reason_code"] = code
        assert (
            await client.post("/stock/issues", json=body, headers=headers)
        ).status_code == 201

    async def adjust(delta, code):
        resp = await client.post(
            "/stock/adjustments",
            json={
                "branch_id": branch_id,
                "location_id": location_id,
                "sku_id": sku_id,
                "qty_delta": delta,
                "reason_code": code,
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    await issue(3, "BREAKAGE")
    await issue(2, "THEFT")
    await issue(1)  # untagged: not shrinkage
    await adjust(-4, "DAMAGE")
    await adjust(5, "COUNT_CORRECTION")  # a gain, not a loss
    return headers, branch_id


@pytest.mark.asyncio
async def test_shrinkage_report_totals_equal_the_tagged_outgoing_moves(client):
    headers, branch_id = await _tagged_scenario(client)

    body = (await client.get("/reports/stock/shrinkage", headers=headers)).json()

    by_reason = {r["reason_code"]: (r["units"], r["value"]) for r in body["items"]}
    assert by_reason == {
        "DAMAGE": (4, "40.00"),
        "BREAKAGE": (3, "30.00"),
        "THEFT": (2, "20.00"),
    }
    assert body["totals"] == {"moves": 3, "units": 9, "value": "90.00"}
    assert {r["branch_id"] for r in body["items"]} == {branch_id}

    moves = (await client.get("/stock/moves?page_size=200", headers=headers)).json()
    tagged = [m for m in moves["items"] if m["reason_code"] and m["qty"] < 0]
    assert sum(-m["qty"] for m in tagged) == body["totals"]["units"]


@pytest.mark.asyncio
async def test_shrinkage_report_filters_by_period_and_rejects_unknown_reasons(client):
    headers, branch_id = await _tagged_scenario(client)

    past = await client.get(
        "/reports/stock/shrinkage?date_to=2000-01-01T00:00:00Z", headers=headers
    )
    assert past.json()["items"] == [] and past.json()["totals"]["units"] == 0

    bad = await client.post(
        "/stock/issues",
        json={
            "branch_id": branch_id,
            "sku_id": 1,
            "qty": 1,
            "reason_code": "BOGUS",
        },
        headers=headers,
    )
    assert bad.status_code in (400, 422)
    assert (await client.get("/reports/stock/shrinkage")).status_code == 401
