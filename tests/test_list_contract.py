"""Contract: every collection GET shares one pagination/sort envelope (issue #52)."""

import pytest

from app.core.pagination import MAX_PAGE_SIZE
from app.main import app

# Non-collection or bounded reference GETs, deliberately outside the contract.
# Anything else without a path parameter must paginate (add it here only with a reason).
EXEMPT = {
    "/health",
    "/health/db",
    "/db",
    "/auth/me",
    "/auth/roles",  # bounded reference data, bare array kept for clients
    "/auth/permissions",  # bounded reference data, bare array kept for clients
    "/data/export/catalog.csv",  # file download
    "/reports/marketing/dashboard-summary",  # single aggregate object
    "/reports/stock/shrinkage",  # paged items plus a totals block
    "/stock/lots/fefo",  # a plan for one SKU, not a collection
    "/public/v1/catalog",  # frozen public contract, see test_public_contract
    "/public/v1/branches",  # frozen public contract, bounded by branch count
}


def _list_routes() -> dict[str, set[str]]:
    out = {}
    for path, item in app.openapi()["paths"].items():
        if path.startswith("/api/") or "{" in path or "get" not in item:
            continue
        if path in EXEMPT:
            continue
        params = {p["name"]: p for p in item["get"].get("parameters", [])}
        out[path] = params
    return out


def test_every_list_route_declares_capped_pagination():
    routes = _list_routes()
    assert len(routes) >= 20
    for path, params in routes.items():
        assert {"page", "page_size"} <= set(params), path
        size = params["page_size"]["schema"]
        assert size["maximum"] == MAX_PAGE_SIZE, path
        assert size["default"] <= MAX_PAGE_SIZE, path
        if "sort" in params or "order" in params:
            assert {"sort", "order", "q"} <= set(params), path


async def _admin(client):
    body = {"name": "A", "email": "a@example.com", "password": "Password123!"}
    assert (await client.post("/auth/register", json=body)).status_code == 201
    resp = await client.post("/auth/login", json=body | {"name": None})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_list_routes_envelope_cap_and_sort_whitelist(client):
    headers = await _admin(client)
    for path, params in _list_routes().items():
        ok = await client.get(path, headers=headers)
        assert ok.status_code == 200, (path, ok.text)
        body = ok.json()
        assert set(body) == {"items", "meta"}, path
        assert set(body["meta"]) == {"page", "page_size", "total", "next", "prev"}
        assert body["meta"]["page_size"] == params["page_size"]["schema"]["default"]

        over = await client.get(
            path, params={"page_size": MAX_PAGE_SIZE + 1}, headers=headers
        )
        assert over.status_code in (400, 422), path
        capped = await client.get(
            path, params={"page_size": MAX_PAGE_SIZE}, headers=headers
        )
        assert capped.status_code == 200, path

        if "sort" in params:
            for bad in ("bogus", "id; DROP TABLE users", "password_hash"):
                resp = await client.get(path, params={"sort": bad}, headers=headers)
                assert resp.status_code == 200, (path, bad)
            bad_order = await client.get(path, params={"order": "up"}, headers=headers)
            assert bad_order.status_code in (400, 422), path


def _walk_pages(session, sort: str, order: str) -> list[int]:
    from sqlalchemy import select

    from app.core.pagination import PaginationParams, apply_order_and_pagination
    from app.models.entities import Category

    ids: list[int] = []
    for page in range(1, 6):
        params = PaginationParams(page=page, page_size=3, sort=sort, order=order)
        stmt = apply_order_and_pagination(
            select(Category.id),
            model=Category,
            params=params,
            allowed_sort_fields={"created_at"},
        )
        ids += list(session.scalars(stmt))
    return ids


@pytest.mark.parametrize("sort", ["bogus", "created_at"])
@pytest.mark.parametrize("order", ["asc", "desc"])
def test_pages_are_stable_and_non_overlapping(sort, order):
    """Unknown or tied sort values still page each row exactly once (#130)."""
    from datetime import UTC, datetime

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.models.base import Base
    from app.models.entities import Category

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine, tables=[Category.__table__])
    same = datetime(2026, 1, 1, tzinfo=UTC)
    with Session(engine) as session:
        session.add_all(Category(name=f"c{i}", created_at=same) for i in range(10))
        session.commit()
        ids = _walk_pages(session, sort, order)
    assert sorted(ids) == list(range(1, 11))
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("sort", ["bogus", "created_at"])
def test_order_by_always_ends_with_primary_key(sort):
    """SQLite masks missing ORDER BY (rowid order), so assert the SQL itself (#130)."""
    from sqlalchemy import select

    from app.core.pagination import PaginationParams, apply_order_and_pagination
    from app.models.entities import Category

    stmt = apply_order_and_pagination(
        select(Category.id),
        model=Category,
        params=PaginationParams(sort=sort),
        allowed_sort_fields={"created_at"},
    )
    assert (
        str(stmt)
        .split("ORDER BY")[1]
        .split("LIMIT")[0]
        .strip()
        .endswith("categories.id")
    )
