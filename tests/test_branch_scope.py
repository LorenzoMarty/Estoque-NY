"""Branch isolation: a non-admin user only reaches the branches assigned to them."""

from dataclasses import dataclass

import pytest
import pytest_asyncio
from sqlalchemy import select

from tests.helpers import create_branch, create_sku, receipt, register_and_login

PASSWORD = "Password123!"


@dataclass
class World:
    client: object
    admin: dict
    operator: dict  # writes + stock reads, branch A only
    viewer: dict  # reads + reports, branch A only
    loner: dict  # operator with no branch at all
    a: int
    a_loc: int
    b: int
    b_loc: int
    c: int
    c_loc: int
    sku: int


async def _register(client, email, name):
    await client.post(
        "/auth/register", json={"name": name, "email": email, "password": PASSWORD}
    )
    login = await client.post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _user_id(client, admin, email):
    users = await client.get("/auth/users?page_size=100", headers=admin)
    return next(u["id"] for u in users.json()["items"] if u["email"] == email)


async def _assign(client, admin, email, branch_ids):
    user_id = await _user_id(client, admin, email)
    response = await client.put(
        f"/auth/users/{user_id}/branches",
        json={"branch_ids": branch_ids},
        headers=admin,
    )
    assert response.status_code == 200
    return user_id


@pytest_asyncio.fixture
async def world(client) -> World:
    admin = await register_and_login(client)
    a, a_loc = await create_branch(client, admin, "Filial A")
    b, b_loc = await create_branch(client, admin, "Filial B")
    c, c_loc = await create_branch(client, admin, "Filial C")
    sku = await create_sku(client, admin, sku_code="SCOPE-1")
    for branch_id, loc_id, qty in ((a, a_loc, 10), (b, b_loc, 20), (c, c_loc, 30)):
        assert (
            await receipt(client, admin, branch_id, loc_id, sku, qty)
        ).status_code == 201

    operator = await _register(client, "op@example.com", "Operator")
    viewer = await _register(client, "viewer@example.com", "Viewer")
    loner = await _register(client, "loner@example.com", "Loner")
    viewer_id = await _user_id(client, admin, "viewer@example.com")
    assert (
        await client.post(
            "/auth/roles/assign",
            json={"user_id": viewer_id, "role_name": "viewer"},
            headers=admin,
        )
    ).status_code == 204
    await _assign(client, admin, "op@example.com", [a])
    await _assign(client, admin, "viewer@example.com", [a])
    await _assign(client, admin, "loner@example.com", [])
    return World(
        client, admin, operator, viewer, loner, a, a_loc, b, b_loc, c, c_loc, sku
    )


def _stock_body(branch_id, location_id, sku, **extra):
    return {"branch_id": branch_id, "location_id": location_id, "sku_id": sku, **extra}


# --- writes -------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path, extra",
    [
        ("/stock/receipts", {"qty": 1}),
        ("/stock/issues", {"qty": 1}),
        ("/stock/adjustments", {"qty_delta": 1}),
    ],
)
async def test_stock_writes_are_limited_to_assigned_branches(world, path, extra):
    w = world

    own = await w.client.post(
        path, json=_stock_body(w.a, w.a_loc, w.sku, **extra), headers=w.operator
    )
    other = await w.client.post(
        path, json=_stock_body(w.b, w.b_loc, w.sku, **extra), headers=w.operator
    )

    assert own.status_code == 201
    assert other.status_code == 403
    assert "no access to branch" in other.json()["error"]["message"]


@pytest.mark.asyncio
async def test_user_without_branches_cannot_write_anywhere(world):
    w = world

    for branch_id, loc_id in ((w.a, w.a_loc), (w.b, w.b_loc)):
        response = await w.client.post(
            "/stock/receipts",
            json=_stock_body(branch_id, loc_id, w.sku, qty=1),
            headers=w.loner,
        )
        assert response.status_code == 403


# --- reads ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_balances_and_moves_only_show_assigned_branches(world):
    w = world

    balances = await w.client.get("/stock/balances", headers=w.operator)
    moves = await w.client.get("/stock/moves", headers=w.operator)

    assert {i["branch_id"] for i in balances.json()["items"]} == {w.a}
    assert {i["branch_id"] for i in moves.json()["items"]} == {w.a}
    assert (
        await w.client.get(f"/stock/balances?branch_id={w.b}", headers=w.operator)
    ).status_code == 403
    assert (
        await w.client.get(f"/stock/moves?branch_id={w.b}", headers=w.operator)
    ).status_code == 403


@pytest.mark.asyncio
async def test_user_without_branches_sees_nothing(world):
    w = world

    balances = await w.client.get("/stock/balances", headers=w.loner)
    branches = await w.client.get("/branches", headers=w.loner)

    assert balances.json()["items"] == []
    assert branches.json()["items"] == []


@pytest.mark.asyncio
async def test_admin_keeps_cross_branch_access(world):
    w = world

    balances = await w.client.get("/stock/balances", headers=w.admin)
    branches = await w.client.get("/branches", headers=w.admin)

    assert {i["branch_id"] for i in balances.json()["items"]} == {w.a, w.b, w.c}
    assert len(branches.json()["items"]) == 3


@pytest.mark.asyncio
async def test_branches_and_locations_are_filtered(world):
    w = world

    branches = await w.client.get("/branches", headers=w.operator)
    own_branch = await w.client.get(f"/branches/{w.a}", headers=w.operator)
    other_branch = await w.client.get(f"/branches/{w.b}", headers=w.operator)
    locations = await w.client.get("/locations", headers=w.operator)
    other_location = await w.client.get(f"/locations/{w.b_loc}", headers=w.operator)
    other_filter = await w.client.get(f"/locations?branch_id={w.b}", headers=w.operator)

    assert [i["id"] for i in branches.json()["items"]] == [w.a]
    assert own_branch.status_code == 200
    assert other_branch.status_code == 403
    assert {i["branch_id"] for i in locations.json()["items"]} == {w.a}
    assert other_location.status_code == 403
    assert other_filter.status_code == 403


# --- transfers ------------------------------------------------------------------


async def _transfer(w, from_branch, from_loc, to_branch, to_loc, headers=None):
    return await w.client.post(
        "/stock/transfers",
        json={
            "from_branch_id": from_branch,
            "from_location_id": from_loc,
            "to_branch_id": to_branch,
            "to_location_id": to_loc,
            "items": [{"sku_id": w.sku, "qty": 1}],
        },
        headers=headers or w.admin,
    )


@pytest.mark.asyncio
async def test_transfers_follow_origin_and_destination_rules(world):
    w = world
    out = await _transfer(w, w.a, w.a_loc, w.b, w.b_loc, w.operator)  # A -> B
    incoming = await _transfer(w, w.b, w.b_loc, w.a, w.a_loc)  # B -> A (admin)
    unrelated = await _transfer(w, w.b, w.b_loc, w.c, w.c_loc)  # B -> C (admin)
    from_other_branch = await _transfer(w, w.b, w.b_loc, w.a, w.a_loc, w.operator)
    assert out.status_code == 201  # origin A is the operator's
    assert from_other_branch.status_code == 403  # origin B is not
    incoming_id = incoming.json()["id"]
    unrelated_id = unrelated.json()["id"]

    listing = await w.client.get("/stock/transfers", headers=w.operator)
    ids = {t["id"] for t in listing.json()["items"]}
    assert out.json()["id"] in ids and incoming_id in ids
    assert unrelated_id not in ids
    assert (
        await w.client.get(f"/stock/transfers/{unrelated_id}", headers=w.operator)
    ).status_code == 403
    assert (
        await w.client.get(f"/stock/transfers/{incoming_id}", headers=w.operator)
    ).status_code == 200

    # ship/cancel need the origin branch; receive needs the destination branch
    assert (
        await w.client.post(f"/stock/transfers/{incoming_id}/ship", headers=w.operator)
    ).status_code == 403
    assert (
        await w.client.post(
            f"/stock/transfers/{incoming_id}/cancel", headers=w.operator
        )
    ).status_code == 403
    assert (
        await w.client.post(f"/stock/transfers/{incoming_id}/ship", headers=w.admin)
    ).status_code == 200
    assert (
        await w.client.post(
            f"/stock/transfers/{incoming_id}/receive", headers=w.operator
        )
    ).status_code == 200
    # the operator's own outgoing transfer cannot be received by them (destination B)
    assert (
        await w.client.post(
            f"/stock/transfers/{out.json()['id']}/ship", headers=w.operator
        )
    ).status_code == 200
    assert (
        await w.client.post(
            f"/stock/transfers/{out.json()['id']}/receive", headers=w.operator
        )
    ).status_code == 403


# --- inventory counts -----------------------------------------------------------


@pytest.mark.asyncio
async def test_inventory_counts_are_limited_to_assigned_branches(world):
    w = world
    base = "/stock/inventory-counts"
    other = await w.client.post(
        base,
        json={"branch_id": w.b, "location_id": w.b_loc, "scope": "ALL"},
        headers=w.admin,
    )
    assert other.status_code == 201
    other_id = other.json()["id"]

    own = await w.client.post(
        base,
        json={"branch_id": w.a, "location_id": w.a_loc, "scope": "ALL"},
        headers=w.operator,
    )
    refused = await w.client.post(
        base,
        json={"branch_id": w.b, "location_id": w.b_loc, "scope": "ALL"},
        headers=w.operator,
    )
    listing = await w.client.get(base, headers=w.operator)

    assert own.status_code == 201
    assert refused.status_code == 403
    assert {c["branch_id"] for c in listing.json()["items"]} == {w.a}
    assert (
        await w.client.get(f"{base}/{other_id}", headers=w.operator)
    ).status_code == 403
    assert (
        await w.client.patch(
            f"{base}/{other_id}/lines", json={"lines": []}, headers=w.operator
        )
    ).status_code == 403
    for action in ("close", "post", "cancel"):
        response = await w.client.post(
            f"{base}/{other_id}/{action}", headers=w.operator
        )
        assert response.status_code == 403, action
    assert (
        await w.client.get(f"{base}/{other_id}", headers=w.admin)
    ).status_code == 200


# --- reports ------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("report", ["valuation", "turnover", "movements", "abc"])
async def test_stock_reports_are_scoped(world, report):
    w = world
    for branch_id, loc_id in ((w.a, w.a_loc), (w.b, w.b_loc)):
        await w.client.post(
            "/stock/issues",
            json=_stock_body(branch_id, loc_id, w.sku, qty=2),
            headers=w.admin,
        )

    own = await w.client.get(f"/reports/stock/{report}", headers=w.viewer)
    refused = await w.client.get(
        f"/reports/stock/{report}?branch_id={w.b}", headers=w.viewer
    )
    everything = await w.client.get(f"/reports/stock/{report}", headers=w.admin)

    assert own.status_code == 200
    assert refused.status_code == 403
    branch_ids = {i["branch_id"] for i in own.json()["items"] if "branch_id" in i}
    assert branch_ids <= {w.a}
    if report != "abc":  # abc is per SKU, not per branch
        assert {i["branch_id"] for i in everything.json()["items"]} >= {w.a, w.b}
    else:
        assert (
            own.json()["items"][0]["movement_value"]
            != everything.json()["items"][0]["movement_value"]
        )


@pytest.mark.asyncio
async def test_marketing_dashboard_totals_only_cover_assigned_branches(world):
    w = world

    scoped = await w.client.get(
        "/reports/marketing/dashboard-summary", headers=w.viewer
    )
    full = await w.client.get("/reports/marketing/dashboard-summary", headers=w.admin)

    # cost 10.00 per unit: A holds 10 units, A+B+C hold 60
    assert float(scoped.json()["stock_valuation_total"]) == 100.0
    assert float(full.json()["stock_valuation_total"]) == 600.0


# --- assignment API -------------------------------------------------------------


@pytest.mark.asyncio
async def test_assign_and_read_user_branches(world):
    w = world
    user_id = await _user_id(w.client, w.admin, "op@example.com")

    replaced = await w.client.put(
        f"/auth/users/{user_id}/branches",
        json={"branch_ids": [w.b, w.c]},
        headers=w.admin,
    )
    read = await w.client.get(f"/auth/users/{user_id}/branches", headers=w.admin)

    assert replaced.json()["branch_ids"] == sorted([w.b, w.c])
    assert read.json() == {
        "user_id": user_id,
        "branch_ids": sorted([w.b, w.c]),
        "roles": {},
        "unrestricted": False,
    }
    # access follows the assignment immediately
    own = await w.client.get("/stock/balances", headers=w.operator)
    assert {i["branch_id"] for i in own.json()["items"]} == {w.b, w.c}


@pytest.mark.asyncio
async def test_assigning_unknown_branch_is_rejected_and_non_admin_cannot_assign(world):
    w = world
    user_id = await _user_id(w.client, w.admin, "op@example.com")

    unknown = await w.client.put(
        f"/auth/users/{user_id}/branches", json={"branch_ids": [9999]}, headers=w.admin
    )
    by_operator = await w.client.put(
        f"/auth/users/{user_id}/branches",
        json={"branch_ids": [w.a]},
        headers=w.operator,
    )
    missing_user = await w.client.get("/auth/users/9999/branches", headers=w.admin)

    assert unknown.status_code == 422
    assert by_operator.status_code == 403
    assert missing_user.status_code == 404


@pytest.mark.asyncio
async def test_admin_is_reported_as_unrestricted(world):
    w = world
    admin_id = await _user_id(w.client, w.admin, "admin@example.com")

    read = await w.client.get(f"/auth/users/{admin_id}/branches", headers=w.admin)

    assert read.json()["unrestricted"] is True


# --- review follow-ups ------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_non_admin_who_creates_a_branch_can_use_it(client):
    from app.db.session import get_sessionmaker
    from app.models.entities import Permission, Role, RolePermission, User, UserRole

    admin = await register_and_login(client)
    await _register(client, "maker@example.com", "Maker")  # stock_operator
    async with get_sessionmaker()() as session:
        # a custom role: the seed resets the built-in ones on every login
        role = Role(name="branch_maker")
        session.add(role)
        await session.flush()
        permission = await session.scalar(
            select(Permission).where(Permission.key == "stock.branch.create")
        )
        user = await session.scalar(
            select(User).where(User.email == "maker@example.com")
        )
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        session.add(UserRole(user_id=user.id, role_id=role.id))
        await session.commit()
    maker_headers = (
        await client.post(
            "/auth/login", json={"email": "maker@example.com", "password": PASSWORD}
        )
    ).json()["access_token"]
    maker = {"Authorization": f"Bearer {maker_headers}"}

    created = await client.post("/branches", json={"name": "Nova"}, headers=maker)
    listing = await client.get("/branches", headers=maker)
    admin_view = await client.get("/branches", headers=admin)

    assert created.status_code == 201
    assert [b["name"] for b in listing.json()["items"]] == ["Nova"]
    assert len(admin_view.json()["items"]) == 1


@pytest.mark.asyncio
async def test_without_authentication_the_scope_is_unrestricted(client):
    from app.core.branch_scope import load_branch_scope
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as session:
        scope = await load_branch_scope(session, None)

    assert scope.unrestricted is True
    assert scope.allows(12345) is True
    assert scope.ids is None


def test_a_restricted_scope_only_allows_its_own_branches():
    from fastapi import HTTPException

    from app.core.branch_scope import BranchScope

    scope = BranchScope(frozenset({1, 2}))

    assert scope.allows(1) and not scope.allows(3)
    assert scope.ids == frozenset({1, 2})
    with pytest.raises(HTTPException) as denied:
        scope.require(3)
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_replacing_a_users_branches_twice_in_a_row_is_idempotent(world):
    w = world
    user_id = await _user_id(w.client, w.admin, "op@example.com")
    body = {"branch_ids": [w.a, w.b]}

    first = await w.client.put(
        f"/auth/users/{user_id}/branches", json=body, headers=w.admin
    )
    second = await w.client.put(
        f"/auth/users/{user_id}/branches", json=body, headers=w.admin
    )

    assert (
        first.json()["branch_ids"] == second.json()["branch_ids"] == sorted([w.a, w.b])
    )


@pytest.mark.asyncio
async def test_simultaneous_replacements_never_500_or_duplicate_rows(world):
    import asyncio
    import os

    if not os.environ.get("TEST_DATABASE_URL", "").startswith("postgres"):
        pytest.skip("row locks need Postgres")
    w = world
    user_id = await _user_id(w.client, w.admin, "op@example.com")
    lists = [[w.a], [w.b], [w.a, w.b], [w.c], [w.b, w.c], [w.a, w.c]] * 2

    responses = await asyncio.gather(
        *[
            w.client.put(
                f"/auth/users/{user_id}/branches",
                json={"branch_ids": ids},
                headers=w.admin,
            )
            for ids in lists
        ]
    )

    assert {r.status_code for r in responses} <= {200, 409}
    final = (
        await w.client.get(f"/auth/users/{user_id}/branches", headers=w.admin)
    ).json()
    assert len(final["branch_ids"]) == len(set(final["branch_ids"]))
    assert sorted(final["branch_ids"]) in [sorted(ids) for ids in lists]
