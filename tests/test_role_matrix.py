"""Per-branch roles: manager, stockkeeper, seller, auditor (docs/roles-matrix.md)."""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.permissions import ALL_PERMISSIONS
from app.core.role_matrix import ROLE_PERMISSIONS
from app.db.session import get_sessionmaker
from app.models.entities import Permission, Role, RolePermission
from tests.helpers import create_branch, create_sku, receipt, register_and_login
from tests.test_branch_scope import _register, _stock_body, _user_id

WRITE_SUFFIXES = (".create", ".update", ".delete", ".ship", ".receive", ".cancel")


# --- the matrix itself -----------------------------------------------------------


def test_roles_are_nested_from_seller_to_manager():
    seller, keeper = ROLE_PERMISSIONS["seller"], ROLE_PERMISSIONS["stockkeeper"]
    manager = ROLE_PERMISSIONS["manager"]

    assert seller < keeper < manager


def test_auditor_only_has_read_permissions():
    auditor = ROLE_PERMISSIONS["auditor"]

    assert auditor
    assert all(key.endswith(".read") for key in auditor)
    assert not any(key.endswith(WRITE_SUFFIXES) for key in auditor)


def test_manager_does_not_manage_users_or_branches():
    manager = ROLE_PERMISSIONS["manager"]

    forbidden = {
        "auth.user.manage",
        "stock.branch.create",
        "stock.branch.update",
        "stock.branch.delete",
        "stock.location.delete",
    }
    assert forbidden.isdisjoint(manager)


def test_every_role_only_uses_known_permissions():
    for keys in ROLE_PERMISSIONS.values():
        assert keys <= set(ALL_PERMISSIONS)


@pytest.mark.asyncio
async def test_seed_stores_the_matrix_in_the_database(client):
    await register_and_login(client)  # first request seeds the roles

    async with get_sessionmaker()() as session:
        for name, expected in ROLE_PERMISSIONS.items():
            keys = set(
                (
                    await session.scalars(
                        select(Permission.key)
                        .join(
                            RolePermission,
                            RolePermission.permission_id == Permission.id,
                        )
                        .join(Role, Role.id == RolePermission.role_id)
                        .where(Role.name == name)
                    )
                ).all()
            )
            assert keys == expected, name


# --- enforcement per branch ------------------------------------------------------


@pytest_asyncio.fixture
async def shop(client):
    admin = await register_and_login(client)
    branches = {}
    for name in "ABCD":
        branches[name] = await create_branch(client, admin, f"Filial {name}")
    sku = await create_sku(client, admin, sku_code="ROLE-1")
    for branch_id, loc_id in branches.values():
        assert (
            await receipt(client, admin, branch_id, loc_id, sku, 50)
        ).status_code == 201
    ana = await _register(client, "ana@example.com", "Ana")  # global stock_operator
    return {
        "client": client,
        "admin": admin,
        "ana": ana,
        "sku": sku,
        "branches": branches,
    }


async def _put_branches(shop, email, branch_ids, roles=None):
    user_id = await _user_id(shop["client"], shop["admin"], email)
    return await shop["client"].put(
        f"/auth/users/{user_id}/branches",
        json={"branch_ids": branch_ids, "roles": roles or {}},
        headers=shop["admin"],
    )


async def _post(shop, path, headers, branch, **extra):
    branch_id, location_id = shop["branches"][branch]
    return await shop["client"].post(
        path,
        json=_stock_body(branch_id, location_id, shop["sku"], **extra),
        headers=headers,
    )


@pytest.mark.asyncio
async def test_branch_role_replaces_global_roles_in_that_branch(shop):
    a, b, c = (shop["branches"][k][0] for k in "ABC")
    response = await _put_branches(
        shop, "ana@example.com", [a, b, c], {a: "auditor", b: "seller"}
    )
    assert response.status_code == 200

    # A = auditor, B = seller, C = no role (the global stock_operator applies)
    ana = shop["ana"]
    receipts, issues = {}, {}
    for key in "ABC":
        receipts[key] = (
            await _post(shop, "/stock/receipts", ana, key, qty=1)
        ).status_code
        issues[key] = (await _post(shop, "/stock/issues", ana, key, qty=1)).status_code
    d_receipt = await _post(shop, "/stock/receipts", ana, "D", qty=1)

    assert receipts == {"A": 403, "B": 403, "C": 201}  # auditor/seller cannot receive
    assert issues == {"A": 403, "B": 201, "C": 201}  # seller can issue, auditor cannot
    assert d_receipt.status_code == 403
    assert "no access to branch" in d_receipt.json()["error"]["message"]
    refused = await _post(shop, "/stock/receipts", ana, "A", qty=1)
    assert "your role in branch" in refused.json()["error"]["message"]


@pytest.mark.asyncio
async def test_auditor_is_read_only_everywhere_even_with_a_writing_global_role(shop):
    client, ana = shop["client"], shop["ana"]
    (a, a_loc), (b, b_loc) = shop["branches"]["A"], shop["branches"]["B"]
    await _put_branches(shop, "ana@example.com", [a, b], {a: "auditor", b: "auditor"})

    writes = [
        await _post(shop, "/stock/receipts", ana, "A", qty=1),
        await _post(shop, "/stock/issues", ana, "A", qty=1),
        await _post(shop, "/stock/adjustments", ana, "B", qty_delta=1),
        await client.post(
            "/stock/transfers",
            json={
                "from_branch_id": a,
                "from_location_id": a_loc,
                "to_branch_id": b,
                "to_location_id": b_loc,
                "items": [{"sku_id": shop["sku"], "qty": 1}],
            },
            headers=ana,
        ),
        await client.post(
            "/stock/inventory-counts",
            json={"branch_id": a, "location_id": a_loc, "scope": "ALL"},
            headers=ana,
        ),
    ]
    reads = [
        await client.get("/stock/balances", headers=ana),
        await client.get("/stock/moves", headers=ana),
        await client.get("/stock/transfers", headers=ana),
        await client.get("/stock/inventory-counts", headers=ana),
        await client.get("/branches", headers=ana),
        await client.get("/locations", headers=ana),
    ]

    assert [r.status_code for r in writes] == [403] * len(writes)
    assert [r.status_code for r in reads] == [200] * len(reads)
    assert {i["branch_id"] for i in reads[0].json()["items"]} == {a, b}


@pytest.mark.asyncio
async def test_branch_role_can_grant_what_the_global_role_does_not(shop):
    client = shop["client"]
    ana_id = await _user_id(client, shop["admin"], "ana@example.com")
    await client.post(
        "/auth/roles/assign",
        json={"user_id": ana_id, "role_name": "viewer"},
        headers=shop["admin"],
    )
    a, b = shop["branches"]["A"][0], shop["branches"]["B"][0]
    await _put_branches(shop, "ana@example.com", [a, b], {a: "stockkeeper"})

    in_a = await _post(shop, "/stock/receipts", shop["ana"], "A", qty=1)
    in_b = await _post(shop, "/stock/receipts", shop["ana"], "B", qty=1)

    assert in_a.status_code == 201  # stockkeeper in A, though the global role is viewer
    assert in_b.status_code == 403  # in B only the read-only global role counts


@pytest.mark.asyncio
async def test_role_must_be_assignable_and_belong_to_an_assigned_branch(shop):
    a, b = shop["branches"]["A"][0], shop["branches"]["B"][0]

    admin_role = await _put_branches(shop, "ana@example.com", [a], {a: "admin"})
    unknown_role = await _put_branches(shop, "ana@example.com", [a], {a: "wizard"})
    stray = await _put_branches(shop, "ana@example.com", [a], {b: "seller"})
    ok = await _put_branches(shop, "ana@example.com", [a, b], {b: "seller"})

    assert admin_role.status_code == 422
    assert unknown_role.status_code == 422
    assert stray.status_code == 422
    assert ok.status_code == 200
    assert ok.json()["roles"] == {str(b): "seller"}


def test_roles_matrix_doc_matches_the_code():
    from app.core.role_matrix import render_matrix_markdown

    with open("docs/roles-matrix.md", encoding="utf-8") as doc:
        assert render_matrix_markdown() in doc.read(), (
            "docs/roles-matrix.md is stale; regenerate the table (see its header)"
        )


# --- review follow-ups ------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_branch_role_does_not_grant_global_endpoints(shop):
    """A manager in branch A must not edit the shared catalog or marketing."""
    client = shop["client"]
    ana_id = await _user_id(client, shop["admin"], "ana@example.com")
    await client.post(
        "/auth/roles/assign",
        json={"user_id": ana_id, "role_name": "viewer"},
        headers=shop["admin"],
    )
    a = shop["branches"]["A"][0]
    await _put_branches(shop, "ana@example.com", [a], {a: "manager"})
    ana = shop["ana"]

    create_product = await client.post(
        "/catalog/products", json={"name": "Intruso", "active": True}, headers=ana
    )
    channel = await client.post(
        "/marketing/channels", json={"name": "X", "type": "SOCIAL"}, headers=ana
    )
    receipt_in_a = await _post(shop, "/stock/receipts", ana, "A", qty=1)

    assert create_product.status_code == 403  # global viewer only
    assert channel.status_code == 403
    assert receipt_in_a.status_code == 201  # the branch role still works in branch A


@pytest.mark.asyncio
async def test_a_branch_scope_without_a_permission_context_denies(client):
    from app.core.branch_scope import load_branch_scope
    from app.db.session import get_sessionmaker
    from app.models.entities import User

    await register_and_login(client)  # admin
    await _register(client, "plain@example.com", "Plain")
    async with get_sessionmaker()() as session:
        plain = await session.scalar(
            select(User).where(User.email == "plain@example.com")
        )
        scope = await load_branch_scope(session, plain)  # no permission given

    assert scope.allows(1) is False
    assert scope.visible_ids == frozenset()


@pytest.mark.asyncio
async def test_margin_report_is_limited_to_the_users_branches(shop):
    a, b = shop["branches"]["A"][0], shop["branches"]["B"][0]
    await _put_branches(shop, "ana@example.com", [a], {a: "manager"})
    ana, client = shop["ana"], shop["client"]

    mine = await client.get("/reports/stock/margin?group_by=branch", headers=ana)
    assert [r["group_id"] for r in mine.json()["items"]] == [a]

    other = await client.get(f"/reports/stock/margin?branch_id={b}", headers=ana)
    assert other.status_code == 403


@pytest.mark.asyncio
async def test_shrinkage_report_is_limited_to_the_users_branches(shop):
    a, b = shop["branches"]["A"][0], shop["branches"]["B"][0]
    for name in "AB":
        resp = await _post(shop, "/stock/issues", shop["admin"], name, qty=2)
        assert resp.status_code == 201
    # an untagged issue per branch (excluded from the report), then a tagged one
    for name in "AB":
        resp = await _post(
            shop, "/stock/issues", shop["admin"], name, qty=3, reason_code="THEFT"
        )
        assert resp.status_code == 201
    await _put_branches(shop, "ana@example.com", [a], {a: "manager"})
    ana, client = shop["ana"], shop["client"]

    mine = await client.get("/reports/stock/shrinkage", headers=ana)
    assert {r["branch_id"] for r in mine.json()["items"]} == {a}
    assert mine.json()["totals"]["units"] == 3

    other = await client.get(f"/reports/stock/shrinkage?branch_id={b}", headers=ana)
    assert other.status_code == 403


@pytest.mark.asyncio
async def test_thresholds_and_low_stock_follow_the_branch_scope(shop):
    a, b = shop["branches"]["A"][0], shop["branches"]["B"][0]
    client, admin, sku = shop["client"], shop["admin"], shop["sku"]
    for branch in (a, b):  # every branch holds 50 units; ask for more
        resp = await client.put(
            "/stock/thresholds",
            json={"branch_id": branch, "sku_id": sku, "min_qty": 80},
            headers=admin,
        )
        assert resp.status_code == 200
    await _put_branches(shop, "ana@example.com", [a], {a: "manager"})
    ana = shop["ana"]

    mine = await client.get("/stock/low-stock", headers=ana)
    assert {i["branch_id"] for i in mine.json()["items"]} == {a}
    assert (
        await client.get(f"/stock/low-stock?branch_id={b}", headers=ana)
    ).status_code == 403
    assert {
        t["branch_id"]
        for t in (await client.get("/stock/thresholds", headers=ana)).json()["items"]
    } == {a}

    denied = await client.put(
        "/stock/thresholds",
        json={"branch_id": b, "sku_id": sku, "min_qty": 1},
        headers=ana,
    )
    assert denied.status_code == 403
