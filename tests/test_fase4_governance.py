"""Regression tests for Fase 4 (pagination envelope, RBAC domain prefixes, seeds)."""

import importlib.util
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from app.core.permissions import ALL_PERMISSIONS
from app.db.session import get_sessionmaker
from app.models.base import Base

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations/versions" / (
    "3e9f8a87d290_rename_catalog_and_stock_permission_.py"
)

LEGACY_PREFIXES = ("branch.", "location.", "category.", "brand.", "product.", "sku.")
DOMAINS = {"catalog", "stock", "marketing", "auth", "reports", "audit"}


async def _register(client, email, name="User"):
    resp = await client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "Password123!"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _login(client, email) -> dict[str, str]:
    resp = await client.post(
        "/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _admin(client) -> dict[str, str]:
    await _register(client, "admin@example.com", "Admin")
    return await _login(client, "admin@example.com")


async def _user_with_role(client, admin, email, role) -> dict[str, str]:
    user_id = await _register(client, email)
    resp = await client.post(
        "/auth/roles/assign",
        json={"user_id": user_id, "role_name": role},
        headers=admin,
    )
    assert resp.status_code == 204
    return await _login(client, email)


async def _post(client, headers, path, payload, status=201):
    resp = await client.post(path, json=payload, headers=headers)
    assert resp.status_code == status, resp.text
    return resp.json()


async def _world(client, headers):
    """3 products/skus/balances, 4 moves, 3 counts, 3 transfers, 3 of each marketing."""
    branch_a = (await _post(client, headers, "/branches", {"name": "A"}))["id"]
    branch_b = (await _post(client, headers, "/branches", {"name": "B"}))["id"]
    loc_a = (
        await _post(
            client,
            headers,
            "/locations",
            {"branch_id": branch_a, "name": "A-dep", "type": "STOCK"},
        )
    )["id"]
    loc_b = (
        await _post(
            client,
            headers,
            "/locations",
            {"branch_id": branch_b, "name": "B-dep", "type": "STOCK"},
        )
    )["id"]

    sku_ids = []
    for i in range(3):
        product = await _post(client, headers, "/catalog/products", {"name": f"P{i}"})
        sku = await _post(
            client,
            headers,
            "/catalog/skus",
            {"product_id": product["id"], "sku_code": f"SKU-{i}", "name": f"S{i}"},
        )
        sku_ids.append(sku["id"])

    # sku0 gets 2 receipts at explicit dates -> deterministic balance_after (5, 12)
    receipts = [
        (sku_ids[0], 5, "2026-01-01T10:00:00Z"),
        (sku_ids[0], 7, "2026-01-02T10:00:00Z"),
        (sku_ids[1], 3, "2026-01-03T10:00:00Z"),
        (sku_ids[2], 4, "2026-01-04T10:00:00Z"),
    ]
    for sku_id, qty, occurred_at in receipts:
        await _post(
            client,
            headers,
            "/stock/receipts",
            {
                "branch_id": branch_a,
                "location_id": loc_a,
                "sku_id": sku_id,
                "qty": qty,
                "occurred_at": occurred_at,
            },
        )

    for _ in range(3):
        await _post(
            client,
            headers,
            "/stock/inventory-counts",
            {"branch_id": branch_a, "location_id": loc_a, "scope": "ALL"},
        )
        await _post(
            client,
            headers,
            "/stock/transfers",
            {
                "from_branch_id": branch_a,
                "from_location_id": loc_a,
                "to_branch_id": branch_b,
                "to_location_id": loc_b,
                "items": [{"sku_id": sku_ids[0], "qty": 1}],
            },
        )

    for i in range(3):
        await _post(
            client,
            headers,
            "/marketing/channels",
            {"name": f"Canal {i}", "type": "EMAIL"},
        )
        await _post(client, headers, "/marketing/campaigns", {"name": f"Camp {i}"})
        await _post(client, headers, "/marketing/promotions", {"name": f"Promo {i}"})
        await _post(
            client, headers, "/marketing/audience-segments", {"name": f"Seg {i}"}
        )
        await _post(
            client,
            headers,
            "/marketing/content-assets",
            {"title": f"Asset {i}", "asset_type": "IMAGE"},
        )
    return {"sku_ids": sku_ids}


LIST_ENDPOINTS = [
    ("/catalog/products", 3),
    ("/catalog/skus", 3),
    ("/stock/balances", 3),
    ("/stock/moves", 4),
    ("/stock/inventory-counts", 3),
    ("/stock/transfers", 3),
    ("/marketing/channels", 3),
    ("/marketing/campaigns", 3),
    ("/marketing/promotions", 3),
    ("/marketing/audience-segments", 3),
    ("/marketing/content-assets", 3),
]


@pytest.mark.asyncio
async def test_list_endpoints_return_paginated_envelope(client):
    headers = await _admin(client)
    await _world(client, headers)

    for path, total in LIST_ENDPOINTS:
        page1 = (await client.get(f"{path}?page_size=2", headers=headers)).json()
        assert set(page1) == {"items", "meta"}, path
        assert len(page1["items"]) == 2, path
        assert page1["meta"] == {
            "page": 1,
            "page_size": 2,
            "total": total,
            "next": 2,
            "prev": None,
        }, path

        url = f"{path}?page_size=2"
        page2 = (await client.get(f"{url}&page=2", headers=headers)).json()
        assert len(page2["items"]) == total - 2, path
        assert page2["meta"]["next"] is None and page2["meta"]["prev"] == 1, path

        beyond = (await client.get(f"{url}&page=99", headers=headers)).json()
        assert beyond["items"] == [], path
        assert beyond["meta"]["total"] == total and beyond["meta"]["next"] is None, path


@pytest.mark.asyncio
async def test_sku_sorting_defaults_and_invalid_sort(client):
    headers = await _admin(client)
    await _world(client, headers)

    def ids(resp):
        assert resp.status_code == 200
        return [item["id"] for item in resp.json()["items"]]

    default = ids(await client.get("/catalog/skus", headers=headers))
    assert default == sorted(default, reverse=True)  # shared default order is desc
    asc = ids(await client.get("/catalog/skus?order=asc", headers=headers))
    assert asc == sorted(asc)
    # SKU has no created_at column: the helper default and a bogus sort must not break
    for sort in ("created_at", "bogus"):
        resp = await client.get(f"/catalog/skus?sort={sort}", headers=headers)
        assert ids(resp) == default


@pytest.mark.asyncio
async def test_moves_balance_after_stays_correct_across_pages(client):
    headers = await _admin(client)
    world = await _world(client, headers)
    sku0 = world["sku_ids"][0]

    balances = []
    for page in (1, 2):
        resp = await client.get(
            f"/stock/moves?sku_id={sku0}&sort=occurred_at&order=asc"
            f"&page_size=1&page={page}",
            headers=headers,
        )
        body = resp.json()
        assert body["meta"]["total"] == 2
        balances.append(body["items"][0]["balance_after"])
    assert balances == [5, 12]


@pytest.mark.asyncio
async def test_viewer_can_list_inventory_counts_but_not_write(client):
    admin = await _admin(client)
    viewer = await _user_with_role(client, admin, "viewer@example.com", "viewer")

    resp = await client.get("/stock/inventory-counts", headers=viewer)
    assert resp.status_code == 200
    assert resp.json()["meta"]["total"] == 0

    write = await client.post(
        "/catalog/products", json={"name": "X"}, headers=viewer
    )
    assert write.status_code == 403


async def _role_permission_keys(role_name: str) -> set[str]:
    async with get_sessionmaker()() as session:
        rows = await session.execute(
            text(
                "SELECT p.key FROM role_permissions rp "
                "JOIN roles r ON r.id = rp.role_id "
                "JOIN permissions p ON p.id = rp.permission_id "
                "WHERE r.name = :name"
            ),
            {"name": role_name},
        )
        return {row[0] for row in rows}


@pytest.mark.asyncio
async def test_role_permission_sets(client):
    admin = await _admin(client)
    operator = await _user_with_role(client, admin, "op@example.com", "stock_operator")

    assert await _role_permission_keys("admin") == set(ALL_PERMISSIONS)

    op = await _role_permission_keys("stock_operator")
    forbidden = {
        f"stock.{res}.{act}"
        for res in ("branch", "location")
        for act in ("create", "update", "delete")
    }
    assert not op & forbidden
    assert {
        "stock.branch.read",
        "stock.location.read",
        "catalog.category.read",
        "catalog.brand.read",
        "catalog.product.create",
        "catalog.product.read",
        "catalog.product.update",
        "catalog.sku.create",
        "catalog.sku.barcode.delete",
        "stock.receipt.create",
        "stock.inventory.read",
        "stock.transfer.ship",
    } <= op
    assert not op & {
        "catalog.brand.create",
        "catalog.category.create",
        "auth.user.manage",
    }

    viewer = await _role_permission_keys("viewer")
    assert viewer == {k for k in ALL_PERMISSIONS if k.endswith(".read")}
    assert "stock.inventory.read" in viewer

    # behaviour matches the sets
    assert (await client.get("/branches", headers=operator)).status_code == 200
    assert (
        await client.post("/branches", json={"name": "Z"}, headers=operator)
    ).status_code == 403


def test_permission_keys_are_domain_prefixed():
    assert len(ALL_PERMISSIONS) == len(set(ALL_PERMISSIONS))
    for key in ALL_PERMISSIONS:
        assert not key.startswith(LEGACY_PREFIXES), key
        parts = key.split(".")
        assert len(parts) >= 2 and parts[0] in DOMAINS, key
        assert all(re.fullmatch(r"[a-z_]+", part) for part in parts), key


def _load_migration():
    spec = importlib.util.spec_from_file_location("mig_3e9f8a87d290", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_renames_cover_exactly_the_legacy_keys():
    renames = _load_migration().RENAMES
    assert len(renames) == 22
    old = {o for o, _ in renames}
    new = {n for _, n in renames}
    assert all(k.startswith(LEGACY_PREFIXES) for k in old)
    assert not old & set(ALL_PERMISSIONS)
    assert new <= set(ALL_PERMISSIONS)
    # every catalog/branch/location permission currently defined is reachable via rename
    migrated_domain = {
        k
        for k in ALL_PERMISSIONS
        if k.startswith(("catalog.", "stock.branch.", "stock.location."))
    }
    assert new == migrated_domain


def test_migration_upgrade_keeps_permission_ids_and_role_links():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    module = _load_migration()
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE permissions (id INTEGER PRIMARY KEY, key)"))
        conn.execute(text("CREATE TABLE role_permissions (role_id, permission_id)"))
        for i, (old, _) in enumerate(module.RENAMES, start=1):
            conn.execute(
                text("INSERT INTO permissions VALUES (:i, :k)"), {"i": i, "k": old}
            )
            conn.execute(
                text("INSERT INTO role_permissions VALUES (1, :i)"), {"i": i}
            )
        conn.execute(text("INSERT INTO permissions VALUES (100, 'auth.user.manage')"))

        with Operations.context(MigrationContext.configure(conn)):
            module.upgrade()

        rows = dict(conn.execute(text("SELECT id, key FROM permissions")).all())
        for i, (_, new) in enumerate(module.RENAMES, start=1):
            assert rows[i] == new
        assert rows[100] == "auth.user.manage"
        links = conn.execute(text("SELECT count(*) FROM role_permissions")).scalar()
        assert links == 22

        with Operations.context(MigrationContext.configure(conn)):
            module.downgrade()
        assert conn.execute(
            text("SELECT key FROM permissions WHERE id = 1")
        ).scalar() == module.RENAMES[0][0]


def _run_seed(db_url: str) -> dict[str, str]:
    env = {**os.environ, "DATABASE_URL": db_url, "APP_ENV": "test"}
    proc = subprocess.run(
        [sys.executable, str(ROOT / "scripts/seed_test_data.py")],
        env=env,
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stderr
    return dict(
        line.split("=", 1) for line in proc.stdout.splitlines() if "=" in line
    )


def test_seed_script_is_idempotent_and_seeds_marketing_and_inventory(tmp_path):
    db_file = tmp_path / "seed.db"
    sync_engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"

    first = _run_seed(db_url)
    for key in (
        "marketing_channels_created",
        "campaigns_created",
        "promotions_created",
        "audience_segments_created",
        "content_assets_created",
        "inventory_counts_created",
    ):
        assert first[key] == "1", key

    second = _run_seed(db_url)
    created = {k: v for k, v in second.items() if k.endswith(("_created", "_updated"))}
    assert created and all(v == "0" for v in created.values()), created

    with sqlite3.connect(db_file) as con:
        assert con.execute(
            "SELECT count(*) FROM inventory_counts WHERE status = 'POSTED'"
        ).fetchone() == (1,)
        assert con.execute(
            "SELECT count(*) FROM stock_moves WHERE inventory_count_id IS NOT NULL"
        ).fetchone()[0] >= 1
        for table in ("campaign_products", "promotion_skus"):
            assert con.execute(f"SELECT count(*) FROM {table}").fetchone() == (1,)


@pytest.mark.asyncio
async def test_openapi_list_endpoints_use_typed_list_models(client):
    expected = {
        "/catalog/products": "ProductListOut",
        "/catalog/skus": "SKUListOut",
        "/stock/balances": "StockBalanceListOut",
        "/stock/moves": "StockMoveListOut",
        "/stock/inventory-counts": "InventoryCountListOut",
        "/stock/transfers": "TransferListOut",
        "/marketing/channels": "MarketingChannelListOut",
        "/marketing/campaigns": "CampaignListOut",
        "/marketing/promotions": "PromotionListOut",
        "/marketing/audience-segments": "AudienceSegmentListOut",
        "/marketing/content-assets": "ContentAssetListOut",
    }
    spec = (await client.get("/openapi.json")).json()
    for path, model in expected.items():
        schema = spec["paths"][path]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        assert schema == {"$ref": f"#/components/schemas/{model}"}, path
