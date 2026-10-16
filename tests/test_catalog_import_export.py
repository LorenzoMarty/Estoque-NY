import csv
import io

import pytest
from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.models.entities import SKU, Product, StockMove
from tests.helpers import create_branch, register_and_login

HEADER = (
    "product_name,brand,category,sku_code,sku_name,barcode,unit,cost,price,"
    "branch,location,opening_qty"
)


def _csv(lines: list[str]) -> str:
    return "\n".join([HEADER, *lines]) + "\n"


async def _post(client, headers, text, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return await client.post(
        f"/data/import/catalog?{query}",
        content=text.encode("utf-8"),
        headers={**headers, "content-type": "text/csv"},
    )


async def _counts():
    async with get_sessionmaker()() as session:
        return (
            await session.scalar(select(func.count()).select_from(Product)),
            await session.scalar(select(func.count()).select_from(SKU)),
            await session.scalar(select(func.count()).select_from(StockMove)),
        )


async def _setup(client):
    headers = await register_and_login(client)
    await create_branch(
        client, headers, "Filial A"
    )  # one location "Filial A - Deposito"
    return headers


def _thousand_rows(bad_every: int = 100) -> tuple[str, list[int]]:
    """1,000 data rows; every `bad_every`-th row has a negative price."""
    lines, bad_lines = [], []
    for i in range(1, 1001):
        price = "-5" if i % bad_every == 0 else "9.90"
        if i % bad_every == 0:
            bad_lines.append(i + 1)  # +1: the header is line 1
        lines.append(f"Produto {i},Marca,Cat,SKU-{i:04d},,,UN,4.50,{price},Filial A,,3")
    return _csv(lines), bad_lines


@pytest.mark.asyncio
async def test_dry_run_reports_what_would_happen_and_writes_nothing(client):
    headers = await _setup(client)

    response = await _post(
        client,
        headers,
        _csv(["Camisa,Marca,Roupas,CAM-1,Camisa P,789,UN,10,20,Filial A,,5"]),
    )

    body = response.json()
    assert response.status_code == 200
    assert body["dry_run"] is True and body["applied"] is False
    assert body["totals"]["created_products"] == 1
    assert body["totals"]["created_skus"] == 1
    assert body["totals"]["opening_stock_applied"] == 1
    assert await _counts() == (0, 0, 0)


@pytest.mark.asyncio
async def test_import_creates_products_skus_and_opening_stock(client):
    headers = await _setup(client)

    response = await _post(
        client,
        headers,
        _csv(
            [
                "Camisa,Marca,Roupas,CAM-P,Camisa P,789,un,10.5,20,Filial A,,5",
                "Camisa,Marca,Roupas,CAM-M,Camisa M,,UN,10.5,20,Filial A,,7",
            ]
        ),
        dry_run="false",
    )

    totals = response.json()["totals"]
    assert totals["created_products"] == 1  # same product on both rows
    assert totals["created_skus"] == 2
    assert totals["opening_stock_applied"] == 2
    assert await _counts() == (1, 2, 2)
    balances = await client.get("/stock/balances", headers=headers)
    assert sorted(b["on_hand"] for b in balances.json()["items"]) == [5, 7]
    skus = (await client.get("/catalog/skus", headers=headers)).json()["items"]
    assert {s["sku_code"]: s["unit"] for s in skus} == {"CAM-P": "UN", "CAM-M": "UN"}


@pytest.mark.asyncio
async def test_1000_rows_with_10_bad_import_990_in_partial_mode(client):
    headers = await _setup(client)
    text, bad_lines = _thousand_rows()

    response = await _post(client, headers, text, dry_run="false", mode="partial")

    body = response.json()
    assert body["totals"]["rows"] == 1000
    assert body["totals"]["valid_rows"] == 990
    assert body["totals"]["created_skus"] == 990
    assert [e["row"] for e in body["errors"]] == bad_lines  # every bad line, in order
    assert {e["field"] for e in body["errors"]} == {"price"}
    assert (await _counts())[1] == 990


@pytest.mark.asyncio
async def test_1000_rows_with_10_bad_import_nothing_in_all_or_nothing_mode(client):
    headers = await _setup(client)
    text, bad_lines = _thousand_rows()

    response = await _post(
        client, headers, text, dry_run="false", mode="all_or_nothing"
    )

    body = response.json()
    assert body["applied"] is False
    assert [e["row"] for e in body["errors"]] == bad_lines
    assert await _counts() == (0, 0, 0)


@pytest.mark.asyncio
async def test_importing_the_same_file_again_creates_no_duplicates(client):
    headers = await _setup(client)
    text = _csv(
        [
            "Camisa,Marca,Roupas,CAM-P,Camisa P,789,UN,10,20,Filial A,,5",
            "Calca,Marca,Roupas,CAL-1,Calca,,UN,30,60,Filial A,,2",
        ]
    )
    await _post(client, headers, text, dry_run="false")
    after_first = await _counts()

    second = await _post(client, headers, text, dry_run="false")

    totals = second.json()["totals"]
    assert totals["created_products"] == totals["created_skus"] == 0
    assert totals["unchanged_skus"] == 2
    assert totals["opening_stock_applied"] == 0
    assert totals["opening_stock_skipped"] == 2
    assert await _counts() == after_first
    balances = await client.get("/stock/balances", headers=headers)
    assert sorted(b["on_hand"] for b in balances.json()["items"]) == [
        2,
        5,
    ]  # not doubled


@pytest.mark.asyncio
async def test_reimport_updates_a_changed_price_without_duplicating(client):
    headers = await _setup(client)
    row = "Camisa,Marca,Roupas,CAM-P,Camisa P,789,UN,10,{price},Filial A,,5"
    await _post(client, headers, _csv([row.format(price="20")]), dry_run="false")

    second = await _post(
        client, headers, _csv([row.format(price="25")]), dry_run="false"
    )

    assert second.json()["totals"]["updated_skus"] == 1
    assert (await _counts())[1] == 1
    skus = (await client.get("/catalog/skus", headers=headers)).json()["items"]
    assert skus[0]["price"] == "25.00"


@pytest.mark.asyncio
async def test_rows_are_validated_with_a_message_per_problem(client):
    headers = await _setup(client)
    text = _csv(
        [
            ",Marca,Cat,SKU-1,,,UN,1,2,Filial A,,1",  # no product name
            "P,Marca,Cat,SKU-2,,,UN,abc,2,Filial A,,1",  # cost not a number
            "P,Marca,Cat,SKU-3,,,UN,1,2,Filial A,,1.5",  # qty not whole
            "P,Marca,Cat,SKU-4,,,UN,1,2,Nowhere,,1",  # unknown branch
            "P,Marca,Cat,SKU-5,,,UN,1,2,,,1",  # qty without branch
            "P,Marca,Cat,SKU-6,,,UN,1,2,Filial A,Prateleira,1",  # unknown location
            "P,Marca,Cat,SKU-OK,,,UN,1,2,Filial A,,1",
        ]
    )

    body = (await _post(client, headers, text, mode="partial")).json()

    by_line = {e["row"]: (e["field"], e["message"]) for e in body["errors"]}
    assert sorted(by_line) == [2, 3, 4, 5, 6, 7]
    assert by_line[2][0] == "product_name"
    assert by_line[3][0] == "cost"
    assert by_line[4][0] == "opening_qty"
    assert "unknown branch" in by_line[5][1]
    assert by_line[6][0] == "branch"
    assert "no location" in by_line[7][1]
    assert body["totals"]["valid_rows"] == 1


@pytest.mark.asyncio
async def test_conflicting_rows_of_the_same_sku_are_rejected(client):
    headers = await _setup(client)
    text = _csv(
        [
            "Camisa,M,C,CAM-1,,,UN,10,20,Filial A,,1",
            "Camisa,M,C,CAM-1,,,UN,10,99,Filial A,,2",  # other price, same stock line
        ]
    )

    body = (await _post(client, headers, text, mode="partial")).json()

    assert [e["row"] for e in body["errors"]] == [3]
    assert "price differs" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_semicolon_separator_and_bom_are_accepted(client):
    headers = await _setup(client)
    body = "Camisa;M;C;CAM-1;;;UN;10,5;20,5;Filial A;;4"
    text = "﻿" + HEADER.replace(",", ";") + "\n" + body + "\n"

    response = await _post(client, headers, text, dry_run="false")

    assert response.json()["totals"]["created_skus"] == 1
    skus = (await client.get("/catalog/skus", headers=headers)).json()["items"]
    assert skus[0]["cost"] == "10.50"  # decimal comma understood


@pytest.mark.asyncio
async def test_missing_required_column_is_a_400(client):
    headers = await _setup(client)

    response = await _post(client, headers, "name,code\nx,y\n")

    assert response.status_code == 400
    assert "product_name" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_export_lists_every_sku_in_the_import_format(client):
    headers = await _setup(client)
    await _post(
        client,
        headers,
        _csv(
            [
                "Camisa,Marca,Roupas,CAM-P,Camisa P,789,UN,10,20,Filial A,,5",
                "Sem estoque,Marca,Roupas,SEM-1,,,UN,1,2,,,",
            ]
        ),
        dry_run="false",
    )

    response = await client.get("/data/export/catalog.csv", headers=headers)

    assert response.status_code == 200
    assert "catalog.csv" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("\ufeff"))))
    by_code = {r["sku_code"]: r for r in rows}
    assert list(rows[0]) == HEADER.split(",")
    assert by_code["CAM-P"]["opening_qty"] == "5"
    assert by_code["CAM-P"]["branch"] == "Filial A"
    assert by_code["SEM-1"]["opening_qty"] == ""


@pytest.mark.asyncio
async def test_an_exported_file_imports_back_without_changing_anything(client):
    headers = await _setup(client)
    await _post(
        client,
        headers,
        _csv(["Camisa,Marca,Roupas,CAM-P,Camisa P,789,UN,10,20,Filial A,,5"]),
        dry_run="false",
    )
    before = await _counts()
    exported = (
        await client.get("/data/export/catalog.csv", headers=headers)
    ).text.removeprefix("﻿")

    again = await _post(client, headers, exported, dry_run="false")

    totals = again.json()["totals"]
    assert totals["created_skus"] == totals["updated_skus"] == 0
    assert totals["opening_stock_applied"] == 0
    assert await _counts() == before


@pytest.mark.asyncio
async def test_import_and_export_require_authentication(client):
    assert (await client.post("/data/import/catalog", content=b"x")).status_code == 401
    assert (await client.get("/data/export/catalog.csv")).status_code == 401


# --- review follow-ups ------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_user_without_the_catalog_permissions_cannot_import(client):
    await register_and_login(client)  # admin
    operator = await client.post(
        "/auth/register",
        json={"name": "Op", "email": "op@example.com", "password": "Password123!"},
    )
    assert operator.status_code == 201
    login = await client.post(
        "/auth/login", json={"email": "op@example.com", "password": "Password123!"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await _post(
        client, headers, _csv(["P,M,C,S-1,,,UN,1,2,,,"]), dry_run="false"
    )

    assert response.status_code == 403  # an operator lacks brand/category creation


@pytest.mark.asyncio
async def test_exported_text_cells_cannot_start_a_spreadsheet_formula(client):
    headers = await _setup(client)
    await _post(
        client,
        headers,
        _csv(['=HYPERLINK("http://evil"),+Marca,@Cat,CAM-1,-nome,,UN,1,2,Filial A,,3']),
        dry_run="false",
    )

    exported = (
        await client.get("/data/export/catalog.csv", headers=headers)
    ).text.removeprefix("﻿")
    row = list(csv.DictReader(io.StringIO(exported)))[0]

    assert row["product_name"].startswith("'=")
    assert row["brand"] == "'+Marca" and row["category"] == "'@Cat"
    assert row["sku_name"] == "'-nome"
    # and importing that file back restores the original text, no stray quote
    before = await _counts()
    again = await _post(client, headers, exported, dry_run="false")
    assert again.json()["totals"]["created_products"] == 0
    assert await _counts() == before


@pytest.mark.asyncio
async def test_unit_can_be_set_back_to_un_and_an_empty_unit_keeps_the_current_one(
    client,
):
    headers = await _setup(client)
    row = "P,M,C,CAM-1,,,{unit},1,2,Filial A,,1"
    await _post(client, headers, _csv([row.format(unit="KG")]), dry_run="false")
    unit = lambda: client.get("/catalog/skus", headers=headers)  # noqa: E731

    await _post(client, headers, _csv([row.format(unit="")]), dry_run="false")
    assert (await unit()).json()["items"][0]["unit"] == "KG"  # empty = not given
    await _post(client, headers, _csv([row.format(unit="UN")]), dry_run="false")
    assert (await unit()).json()["items"][0]["unit"] == "UN"


@pytest.mark.asyncio
async def test_a_real_import_writes_one_audit_entry_and_a_dry_run_none(client):
    headers = await _setup(client)
    text = _csv(["P,M,C,CAM-1,,,UN,1,2,Filial A,,1"])

    await _post(client, headers, text)  # dry run
    await _post(client, headers, text, dry_run="false")

    logs = (await client.get("/admin/audit-logs?page_size=100", headers=headers)).json()
    actions = [i["action"] for i in logs["items"]]
    assert actions.count("data.import.catalog") == 1


@pytest.mark.asyncio
async def test_a_body_over_the_size_limit_is_refused_before_it_is_parsed(client):
    headers = await _setup(client)
    huge = HEADER + "\n" + ("x" * (5 * 1024 * 1024 + 10))

    response = await _post(client, headers, huge)

    assert response.status_code == 413


@pytest.mark.asyncio
async def test_too_many_rows_are_refused(client, monkeypatch):
    from app.services import catalog_io_service

    monkeypatch.setattr(catalog_io_service, "MAX_ROWS", 3)
    headers = await _setup(client)
    lines = [f"P{i},M,C,S-{i},,,UN,1,2,,," for i in range(4)]

    response = await _post(client, headers, _csv(lines))

    assert response.status_code == 400
    assert "more than 3 rows" in response.json()["error"]["message"]


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "sNaN"])
async def test_non_finite_numbers_are_a_row_error_not_a_500(client, value):
    headers = await _setup(client)
    text = _csv(
        [f"P,M,C,S-1,,,UN,{value},2,,,", "Q,M,C,S-2,,,UN,1,2,,,"],
    )

    response = await _post(client, headers, text, mode="partial")

    assert response.status_code == 200
    body = response.json()
    assert [e["row"] for e in body["errors"]] == [2]
    assert body["totals"]["valid_rows"] == 1


@pytest.mark.asyncio
async def test_a_windows_1252_file_from_excel_keeps_its_accents(client):
    headers = await _setup(client)
    text = _csv(["Calça Jeans,Marca,Roupas,JEANS-1,,,UN,1,2,,,"])

    response = await client.post(
        "/data/import/catalog?dry_run=false",
        content=text.encode("cp1252"),
        headers={**headers, "content-type": "text/csv"},
    )
    again = await client.post(
        "/data/import/catalog?dry_run=false",
        content=text.encode("cp1252"),
        headers={**headers, "content-type": "text/csv"},
    )

    assert response.json()["totals"]["created_products"] == 1
    assert again.json()["totals"]["created_products"] == 0  # same name, no duplicate
    products = (await client.get("/catalog/products", headers=headers)).json()["items"]
    assert products[0]["name"] == "Calça Jeans"


@pytest.mark.asyncio
async def test_the_export_starts_with_a_bom_for_excel(client):
    headers = await _setup(client)

    raw = await client.get("/data/export/catalog.csv", headers=headers)

    assert raw.content.startswith(b"\xef\xbb\xbf")
