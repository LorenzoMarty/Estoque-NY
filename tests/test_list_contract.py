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
    "/public/v1/catalog",  # frozen public contract, see test_public_contract
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
