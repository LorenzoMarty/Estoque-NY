import pytest

from tests.helpers import (
    create_branch,
    create_sku,
    on_hand,
    receipt,
    register_and_login,
)

pytestmark = pytest.mark.asyncio

CSV_HEADER = "external_id,branch_id,sold_at,sku_code,qty,unit_price\n"


async def _setup(client, qty=10):
    headers = await register_and_login(client)
    branch_id, location_id = await create_branch(client, headers)
    sku_id = await create_sku(client, headers, sku_code="IMP-1")
    await receipt(client, headers, branch_id, location_id, sku_id, qty)
    return headers, branch_id, sku_id


def _csv(branch_id, rows):
    lines = [
        f"{ext},{branch_id},2026-11-01T10:00:00+00:00,{sku},{qty},5.00"
        for ext, sku, qty in rows
    ]
    return CSV_HEADER + "\n".join(lines) + "\n"


async def _post_csv(client, headers, text, **params):
    params = {"source": "pos", **params}
    return await client.post(
        "/sales/import/csv",
        params=params,
        content=text.encode(),
        headers={**headers, "Content-Type": "text/csv"},
    )


async def test_dry_run_changes_nothing_and_real_run_is_idempotent(client):
    headers, branch_id, sku_id = await _setup(client)
    text = _csv(branch_id, [("A1", "IMP-1", 2), ("A1", "IMP-1", 1), ("A2", "IMP-1", 4)])

    dry = await _post_csv(client, headers, text)
    assert dry.json()["totals"]["created"] == 2
    assert await on_hand(client, headers, branch_id, sku_id) == 10

    first = await _post_csv(client, headers, text, dry_run="false")
    second = await _post_csv(client, headers, text, dry_run="false")

    assert first.json()["totals"] == {"created": 2, "duplicates": 0, "errors": 0}
    assert second.json()["totals"] == {"created": 0, "duplicates": 2, "errors": 0}
    assert await on_hand(client, headers, branch_id, sku_id) == 3
    sales = (await client.get("/sales", headers=headers)).json()
    assert sales["meta"]["total"] == 2
    assert {s["source"] for s in sales["items"]} == {"import:pos"}


async def test_bad_sales_are_reported_and_the_rest_go_in(client):
    headers, branch_id, sku_id = await _setup(client, qty=5)
    text = _csv(
        branch_id, [("OK", "IMP-1", 2), ("NOSKU", "NOPE", 1), ("BIG", "IMP-1", 9)]
    )
    text += "BAD,x,2026-11-01,IMP-1,1,1\n"

    resp = await _post_csv(client, headers, text, dry_run="false")

    body = resp.json()
    assert body["created"] == ["OK"]
    errors = {e.get("external_id") or e.get("line"): e["error"] for e in body["errors"]}
    assert "unknown sku_code NOPE" in errors["NOSKU"]
    assert "insufficient stock" in errors["BIG"]
    assert 5 in errors  # the unparsable line, by line number
    assert await on_hand(client, headers, branch_id, sku_id) == 3


async def test_json_import_and_missing_columns(client):
    headers, branch_id, sku_id = await _setup(client)
    payload = {
        "source": "erp",
        "sales": [
            {
                "external_id": "J1",
                "branch_id": branch_id,
                "sold_at": "2026-11-01T10:00:00Z",
                "items": [{"sku_code": "IMP-1", "qty": 1}],
            }
        ],
    }

    ok = await client.post(
        "/sales/import", params={"dry_run": "false"}, json=payload, headers=headers
    )
    bad = await _post_csv(client, headers, "foo,bar\n1,2\n")

    assert ok.json()["created"] == ["J1"]
    assert "missing columns" in bad.json()["errors"][0]["error"]
