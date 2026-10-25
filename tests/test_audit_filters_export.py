import csv
from io import StringIO

import pytest

from app.modules.audit.service import CSV_COLUMNS, _safe_cell
from tests.helpers import create_branch, create_sku, register_and_login

pytestmark = pytest.mark.asyncio

LOGS = "/admin/audit-logs"


async def _scenario(client):
    headers = await register_and_login(client)
    branch_a, _ = await create_branch(client, headers, "Filial A")
    branch_b, _ = await create_branch(client, headers, "Filial B")
    sku_id = await create_sku(client, headers, sku_code="AUD-1")
    for branch in (branch_a, branch_b):
        resp = await client.put(
            "/stock/thresholds",
            json={"branch_id": branch, "sku_id": sku_id, "min_qty": 3},
            headers=headers,
        )
        assert resp.status_code == 200
    return headers, branch_a, branch_b


def _rows(text: str) -> list[dict]:
    return list(csv.DictReader(StringIO(text)))


async def test_branch_filter_returns_only_that_branchs_entries(client):
    headers, branch_a, branch_b = await _scenario(client)

    only_a = (
        await client.get(LOGS, params={"branch_id": branch_a}, headers=headers)
    ).json()

    assert only_a["items"], "expected audit entries for branch A"
    assert {i["branch_id"] for i in only_a["items"]} == {branch_a}
    actions = {i["action"] for i in only_a["items"]}
    assert {"branch.create", "stock.threshold.set"} <= actions


async def test_entity_and_user_filters(client):
    headers, branch_a, _ = await _scenario(client)

    entity = (
        await client.get(
            LOGS,
            params={"resource_type": "branch", "resource_id": str(branch_a)},
            headers=headers,
        )
    ).json()["items"]
    assert [i["action"] for i in entity] == ["branch.create"]

    nobody = await client.get(LOGS, params={"user_id": 999}, headers=headers)
    assert nobody.json()["items"] == []


async def test_csv_export_matches_the_filtered_list(client):
    headers, branch_a, _ = await _scenario(client)
    params = {"branch_id": branch_a, "action": "threshold"}

    listed = (await client.get(LOGS, params=params, headers=headers)).json()["items"]
    exported = await client.get(
        LOGS, params={**params, "export": "csv"}, headers=headers
    )

    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert "audit_logs.csv" in exported.headers["content-disposition"]
    rows = _rows(exported.text)
    assert list(rows[0].keys()) == CSV_COLUMNS
    assert [r["id"] for r in rows] == [str(i["id"]) for i in listed]
    assert {r["branch_id"] for r in rows} == {str(branch_a)}


async def test_csv_export_ignores_paging_and_requires_permission(client):
    headers, *_ = await _scenario(client)

    everything = (
        await client.get(LOGS, params={"page_size": 1}, headers=headers)
    ).json()
    exported = await client.get(
        LOGS, params={"export": "csv", "page_size": 1}, headers=headers
    )

    assert len(_rows(exported.text)) == everything["meta"]["total"] > 1
    assert (await client.get(LOGS, params={"export": "csv"})).status_code == 401


async def test_unknown_export_format_is_rejected(client):
    headers, *_ = await _scenario(client)
    resp = await client.get(LOGS, params={"export": "xlsx"}, headers=headers)
    assert resp.status_code in (400, 422)


async def test_formula_like_cells_are_neutralised():
    assert _safe_cell("=1+1") == "'=1+1"
    assert _safe_cell("@cmd") == "'@cmd"
    assert _safe_cell("-5") == "'-5"
    assert _safe_cell("branch.create") == "branch.create"
    assert _safe_cell(7) == 7
