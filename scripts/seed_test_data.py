#!/usr/bin/env python
"""Seed deterministic test data in the configured database."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed test data for local development")
    parser.add_argument(
        "--admin-email",
        default="admin@estoque.local",
        help="User used as creator for seeded moves/transfers when available.",
    )
    return parser.parse_args()


async def _seed(args: argparse.Namespace) -> None:
    from datetime import UTC, datetime, timedelta
    from decimal import Decimal

    from sqlalchemy import func, select

    from app.db.session import dispose_engine, get_sessionmaker
    from app.domain.stock_engine import apply_move
    from app.domain.transfer_service import (
        create_transfer,
        receive_transfer,
        ship_transfer,
    )
    from app.models.entities import (
        SKU,
        Branch,
        Brand,
        Category,
        Location,
        Product,
        SKUBarcode,
        StockMove,
        TransferOrder,
        User,
    )
    from app.models.enums import LocationType, MoveType, TransferStatus
    from app.schemas.transfer import TransferCreateIn, TransferItemIn
    from app.services.auth_service import ensure_rbac_seed

    summary = {
        "branches_created": 0,
        "locations_created": 0,
        "categories_created": 0,
        "brands_created": 0,
        "products_created": 0,
        "skus_created": 0,
        "barcode_aliases_created": 0,
        "moves_created": 0,
        "transfers_created": 0,
        "transfers_updated": 0,
    }

    sessionmaker = get_sessionmaker()

    async with sessionmaker() as session:
        async with session.begin():
            await ensure_rbac_seed(session)

            admin_email = str(args.admin_email or "").strip().lower()
            actor = await session.scalar(select(User).where(User.email == admin_email))
            actor_id = actor.id if actor else None

            async def get_or_create(model, *, lookup: dict, create: dict):
                item = await session.scalar(select(model).filter_by(**lookup))
                created = False
                if item is None:
                    item = model(**create)
                    session.add(item)
                    await session.flush()
                    created = True
                return item, created

            branch_defs = [
                {
                    "key": "manhattan",
                    "name": "Matriz Manhattan",
                    "locations": {
                        "store": ("Loja Manhattan", LocationType.STORE),
                        "stock": ("Deposito Manhattan", LocationType.STOCK),
                        "damaged": ("Avarias Manhattan", LocationType.DAMAGED),
                    },
                },
                {
                    "key": "jfk",
                    "name": "Filial JFK",
                    "locations": {
                        "store": ("Loja JFK", LocationType.STORE),
                        "stock": ("Deposito JFK", LocationType.STOCK),
                        "damaged": ("Avarias JFK", LocationType.DAMAGED),
                    },
                },
                {
                    "key": "brooklyn",
                    "name": "Filial Brooklyn",
                    "locations": {
                        "store": ("Loja Brooklyn", LocationType.STORE),
                        "stock": ("Deposito Brooklyn", LocationType.STOCK),
                        "damaged": ("Avarias Brooklyn", LocationType.DAMAGED),
                    },
                },
            ]

            branch_by_key: dict[str, Branch] = {}
            location_by_slot: dict[tuple[str, str], Location] = {}
            for branch_def in branch_defs:
                branch, created = await get_or_create(
                    Branch,
                    lookup={"name": branch_def["name"]},
                    create={"name": branch_def["name"]},
                )
                if created:
                    summary["branches_created"] += 1
                branch_by_key[branch_def["key"]] = branch

                for slot, (location_name, location_type) in branch_def[
                    "locations"
                ].items():
                    location, created = await get_or_create(
                        Location,
                        lookup={"branch_id": branch.id, "name": location_name},
                        create={
                            "branch_id": branch.id,
                            "name": location_name,
                            "type": location_type,
                        },
                    )
                    if created:
                        summary["locations_created"] += 1
                    if location.type != location_type:
                        location.type = location_type
                    location_by_slot[(branch_def["key"], slot)] = location

            category_names = ["Bebidas", "Chocolates", "Perfumaria", "Eletronicos"]
            categories: dict[str, Category] = {}
            for name in category_names:
                category, created = await get_or_create(
                    Category,
                    lookup={"name": name},
                    create={"name": name},
                )
                if created:
                    summary["categories_created"] += 1
                categories[name] = category

            brand_names = ["Alpine Spring", "Cocoa Sky", "Aroma Lux", "JetSound"]
            brands: dict[str, Brand] = {}
            for name in brand_names:
                brand, created = await get_or_create(
                    Brand,
                    lookup={"name": name},
                    create={"name": name},
                )
                if created:
                    summary["brands_created"] += 1
                brands[name] = brand

            product_defs = [
                {
                    "key": "water",
                    "name": "Agua Mineral Alpine",
                    "category": "Bebidas",
                    "brand": "Alpine Spring",
                },
                {
                    "key": "cola",
                    "name": "Refrigerante Cola Sky",
                    "category": "Bebidas",
                    "brand": "Cocoa Sky",
                },
                {
                    "key": "choc",
                    "name": "Chocolate Dark 70",
                    "category": "Chocolates",
                    "brand": "Cocoa Sky",
                },
                {
                    "key": "perfume",
                    "name": "Perfume Breeze",
                    "category": "Perfumaria",
                    "brand": "Aroma Lux",
                },
                {
                    "key": "headphone",
                    "name": "Fone Bluetooth AirBeat",
                    "category": "Eletronicos",
                    "brand": "JetSound",
                },
                {
                    "key": "charger",
                    "name": "Carregador USB-C 20W",
                    "category": "Eletronicos",
                    "brand": "JetSound",
                },
            ]

            product_by_key: dict[str, Product] = {}
            for product_def in product_defs:
                product, created = await get_or_create(
                    Product,
                    lookup={"name": product_def["name"]},
                    create={
                        "name": product_def["name"],
                        "description": f"Produto de teste: {product_def['name']}",
                        "category_id": categories[product_def["category"]].id,
                        "brand_id": brands[product_def["brand"]].id,
                        "brand": None,
                        "active": True,
                    },
                )
                if created:
                    summary["products_created"] += 1
                product.category_id = categories[product_def["category"]].id
                product.brand_id = brands[product_def["brand"]].id
                product.active = True
                product_by_key[product_def["key"]] = product

            sku_defs = [
                {
                    "sku_code": "ALP-WATER-500",
                    "product_key": "water",
                    "name": "Agua 500ml",
                    "barcode": "7895000000001",
                    "cost": Decimal("2.20"),
                    "price": Decimal("6.90"),
                    "attributes": {"size_ml": 500},
                },
                {
                    "sku_code": "ALP-WATER-1000",
                    "product_key": "water",
                    "name": "Agua 1L",
                    "barcode": "7895000000002",
                    "cost": Decimal("3.10"),
                    "price": Decimal("8.90"),
                    "attributes": {"size_ml": 1000},
                },
                {
                    "sku_code": "COLA-350",
                    "product_key": "cola",
                    "name": "Cola 350ml",
                    "barcode": "7895000000003",
                    "cost": Decimal("2.90"),
                    "price": Decimal("9.50"),
                    "attributes": {"size_ml": 350},
                },
                {
                    "sku_code": "CHOC-70-100",
                    "product_key": "choc",
                    "name": "Chocolate 70 100g",
                    "barcode": "7895000000004",
                    "cost": Decimal("5.80"),
                    "price": Decimal("17.90"),
                    "attributes": {"weight_g": 100},
                },
                {
                    "sku_code": "CHOC-70-200",
                    "product_key": "choc",
                    "name": "Chocolate 70 200g",
                    "barcode": "7895000000005",
                    "cost": Decimal("9.90"),
                    "price": Decimal("29.90"),
                    "attributes": {"weight_g": 200},
                },
                {
                    "sku_code": "BREEZE-30",
                    "product_key": "perfume",
                    "name": "Perfume Breeze 30ml",
                    "barcode": "7895000000006",
                    "cost": Decimal("28.00"),
                    "price": Decimal("79.90"),
                    "attributes": {"size_ml": 30},
                },
                {
                    "sku_code": "BREEZE-50",
                    "product_key": "perfume",
                    "name": "Perfume Breeze 50ml",
                    "barcode": "7895000000007",
                    "cost": Decimal("42.00"),
                    "price": Decimal("119.90"),
                    "attributes": {"size_ml": 50},
                },
                {
                    "sku_code": "AIRBEAT-BLK",
                    "product_key": "headphone",
                    "name": "AirBeat Preto",
                    "barcode": "7895000000008",
                    "cost": Decimal("85.00"),
                    "price": Decimal("199.90"),
                    "attributes": {"color": "black"},
                },
                {
                    "sku_code": "CHARGER-20W",
                    "product_key": "charger",
                    "name": "Carregador USB-C 20W",
                    "barcode": "7895000000009",
                    "cost": Decimal("32.00"),
                    "price": Decimal("89.90"),
                    "attributes": {"power_w": 20},
                },
            ]

            sku_by_code: dict[str, SKU] = {}
            for sku_def in sku_defs:
                sku, created = await get_or_create(
                    SKU,
                    lookup={"sku_code": sku_def["sku_code"]},
                    create={
                        "product_id": product_by_key[sku_def["product_key"]].id,
                        "sku_code": sku_def["sku_code"],
                        "name": sku_def["name"],
                        "barcode": sku_def["barcode"],
                        "unit": "UN",
                        "attributes": sku_def["attributes"],
                        "cost": sku_def["cost"],
                        "price": sku_def["price"],
                        "tax_code": None,
                        "active": True,
                    },
                )
                if created:
                    summary["skus_created"] += 1

                sku.product_id = product_by_key[sku_def["product_key"]].id
                sku.name = sku_def["name"]
                sku.barcode = sku_def["barcode"]
                sku.unit = "UN"
                sku.attributes = sku_def["attributes"]
                sku.cost = sku_def["cost"]
                sku.price = sku_def["price"]
                sku.active = True
                sku_by_code[sku_def["sku_code"]] = sku

            barcode_alias_defs = [
                ("ALP-WATER-500", "7895000099001"),
                ("COLA-350", "7895000099002"),
                ("CHOC-70-100", "7895000099003"),
            ]
            for sku_code, barcode in barcode_alias_defs:
                exists = await session.scalar(
                    select(SKUBarcode.id).where(SKUBarcode.barcode == barcode)
                )
                if exists is not None:
                    continue
                session.add(
                    SKUBarcode(
                        sku_id=sku_by_code[sku_code].id,
                        barcode=barcode,
                    )
                )
                summary["barcode_aliases_created"] += 1

            move_plan = [
                (
                    "SEED-MV-0001",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "ALP-WATER-500",
                    200,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0002",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "ALP-WATER-1000",
                    160,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0003",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "COLA-350",
                    180,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0004",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "CHOC-70-100",
                    140,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0005",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "CHOC-70-200",
                    90,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0006",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "BREEZE-30",
                    70,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0007",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "BREEZE-50",
                    50,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0008",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "AIRBEAT-BLK",
                    35,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0009",
                    MoveType.RECEIPT,
                    "manhattan",
                    "stock",
                    "CHARGER-20W",
                    60,
                    "INITIAL_STOCK",
                    30,
                ),
                (
                    "SEED-MV-0010",
                    MoveType.RECEIPT,
                    "jfk",
                    "stock",
                    "ALP-WATER-500",
                    80,
                    "INITIAL_STOCK",
                    27,
                ),
                (
                    "SEED-MV-0011",
                    MoveType.RECEIPT,
                    "jfk",
                    "stock",
                    "COLA-350",
                    60,
                    "INITIAL_STOCK",
                    27,
                ),
                (
                    "SEED-MV-0012",
                    MoveType.RECEIPT,
                    "jfk",
                    "stock",
                    "BREEZE-30",
                    20,
                    "INITIAL_STOCK",
                    27,
                ),
                (
                    "SEED-MV-0013",
                    MoveType.RECEIPT,
                    "jfk",
                    "stock",
                    "CHARGER-20W",
                    18,
                    "INITIAL_STOCK",
                    27,
                ),
                (
                    "SEED-MV-0014",
                    MoveType.RECEIPT,
                    "brooklyn",
                    "stock",
                    "ALP-WATER-500",
                    75,
                    "INITIAL_STOCK",
                    25,
                ),
                (
                    "SEED-MV-0015",
                    MoveType.RECEIPT,
                    "brooklyn",
                    "stock",
                    "CHOC-70-100",
                    40,
                    "INITIAL_STOCK",
                    25,
                ),
                (
                    "SEED-MV-0016",
                    MoveType.RECEIPT,
                    "brooklyn",
                    "stock",
                    "BREEZE-50",
                    15,
                    "INITIAL_STOCK",
                    25,
                ),
                (
                    "SEED-MV-0017",
                    MoveType.RECEIPT,
                    "brooklyn",
                    "stock",
                    "AIRBEAT-BLK",
                    12,
                    "INITIAL_STOCK",
                    25,
                ),
                (
                    "SEED-MV-0018",
                    MoveType.ISSUE,
                    "manhattan",
                    "stock",
                    "ALP-WATER-500",
                    -45,
                    "SALE",
                    7,
                ),
                (
                    "SEED-MV-0019",
                    MoveType.ISSUE,
                    "manhattan",
                    "stock",
                    "CHOC-70-100",
                    -20,
                    "SALE",
                    6,
                ),
                (
                    "SEED-MV-0020",
                    MoveType.ISSUE,
                    "manhattan",
                    "stock",
                    "BREEZE-30",
                    -8,
                    "SALE",
                    5,
                ),
                (
                    "SEED-MV-0021",
                    MoveType.ISSUE,
                    "manhattan",
                    "stock",
                    "CHARGER-20W",
                    -6,
                    "SALE",
                    4,
                ),
                (
                    "SEED-MV-0022",
                    MoveType.ISSUE,
                    "jfk",
                    "stock",
                    "ALP-WATER-500",
                    -18,
                    "SALE",
                    6,
                ),
                (
                    "SEED-MV-0023",
                    MoveType.ISSUE,
                    "jfk",
                    "stock",
                    "COLA-350",
                    -10,
                    "SALE",
                    4,
                ),
                (
                    "SEED-MV-0024",
                    MoveType.ISSUE,
                    "brooklyn",
                    "stock",
                    "CHOC-70-100",
                    -6,
                    "SALE",
                    5,
                ),
                (
                    "SEED-MV-0025",
                    MoveType.ISSUE,
                    "brooklyn",
                    "stock",
                    "AIRBEAT-BLK",
                    -3,
                    "SALE",
                    3,
                ),
                (
                    "SEED-MV-0026",
                    MoveType.ADJUSTMENT,
                    "manhattan",
                    "stock",
                    "CHOC-70-200",
                    4,
                    "COUNT_ADJUST",
                    2,
                ),
                (
                    "SEED-MV-0027",
                    MoveType.ADJUSTMENT,
                    "jfk",
                    "stock",
                    "BREEZE-30",
                    -2,
                    "COUNT_ADJUST",
                    2,
                ),
                (
                    "SEED-MV-0028",
                    MoveType.ADJUSTMENT,
                    "brooklyn",
                    "stock",
                    "ALP-WATER-500",
                    5,
                    "COUNT_ADJUST",
                    1,
                ),
            ]

            now_utc = datetime.now(UTC)
            for (
                ref,
                move_type,
                branch_key,
                slot,
                sku_code,
                qty_delta,
                reason,
                days_ago,
            ) in move_plan:
                exists = await session.scalar(
                    select(StockMove.id).where(
                        StockMove.move_type == move_type,
                        StockMove.reference_id == ref,
                    )
                )
                if exists is not None:
                    continue

                await apply_move(
                    session=session,
                    branch_id=branch_by_key[branch_key].id,
                    sku_id=sku_by_code[sku_code].id,
                    qty_delta=qty_delta,
                    move_type=move_type,
                    reason=reason,
                    reference_id=ref,
                    occurred_at=now_utc - timedelta(days=days_ago),
                    location_id=location_by_slot[(branch_key, slot)].id,
                    created_by=actor_id,
                )
                summary["moves_created"] += 1

            async def ensure_transfer(
                *,
                note: str,
                from_branch_key: str,
                from_slot: str,
                to_branch_key: str,
                to_slot: str,
                items: list[tuple[str, int]],
                target_status: TransferStatus,
            ) -> None:
                transfer = await session.scalar(
                    select(TransferOrder)
                    .where(TransferOrder.note == note)
                    .order_by(TransferOrder.id.asc())
                )

                if transfer is None:
                    payload = TransferCreateIn(
                        from_branch_id=branch_by_key[from_branch_key].id,
                        from_location_id=location_by_slot[
                            (from_branch_key, from_slot)
                        ].id,
                        to_branch_id=branch_by_key[to_branch_key].id,
                        to_location_id=location_by_slot[(to_branch_key, to_slot)].id,
                        items=[
                            TransferItemIn(sku_id=sku_by_code[sku_code].id, qty=qty)
                            for sku_code, qty in items
                        ],
                        note=note,
                    )
                    transfer = await create_transfer(
                        session=session,
                        payload=payload,
                        user_id=actor_id,
                    )
                    summary["transfers_created"] += 1

                if target_status in {TransferStatus.SHIPPED, TransferStatus.RECEIVED}:
                    if transfer.status == TransferStatus.DRAFT:
                        transfer = await ship_transfer(
                            session=session,
                            transfer_id=transfer.id,
                            user_id=actor_id,
                        )
                        summary["transfers_updated"] += 1

                if target_status == TransferStatus.RECEIVED:
                    if transfer.status == TransferStatus.SHIPPED:
                        await receive_transfer(
                            session=session,
                            transfer_id=transfer.id,
                            user_id=actor_id,
                        )
                        summary["transfers_updated"] += 1

            await ensure_transfer(
                note="SEED-TR-DRAFT",
                from_branch_key="jfk",
                from_slot="stock",
                to_branch_key="brooklyn",
                to_slot="stock",
                items=[("ALP-WATER-500", 10), ("COLA-350", 8)],
                target_status=TransferStatus.DRAFT,
            )
            await ensure_transfer(
                note="SEED-TR-SHIPPED",
                from_branch_key="manhattan",
                from_slot="stock",
                to_branch_key="jfk",
                to_slot="stock",
                items=[("CHOC-70-200", 12), ("AIRBEAT-BLK", 4)],
                target_status=TransferStatus.SHIPPED,
            )
            await ensure_transfer(
                note="SEED-TR-RECEIVED",
                from_branch_key="manhattan",
                from_slot="stock",
                to_branch_key="brooklyn",
                to_slot="stock",
                items=[("COLA-350", 20), ("BREEZE-30", 6)],
                target_status=TransferStatus.RECEIVED,
            )

        totals = {
            "branches": await session.scalar(select(func.count()).select_from(Branch))
            or 0,
            "locations": await session.scalar(
                select(func.count()).select_from(Location)
            )
            or 0,
            "categories": await session.scalar(
                select(func.count()).select_from(Category)
            )
            or 0,
            "brands": await session.scalar(select(func.count()).select_from(Brand))
            or 0,
            "products": await session.scalar(select(func.count()).select_from(Product))
            or 0,
            "skus": await session.scalar(select(func.count()).select_from(SKU)) or 0,
            "stock_moves": await session.scalar(
                select(func.count()).select_from(StockMove)
            )
            or 0,
            "transfers": await session.scalar(
                select(func.count()).select_from(TransferOrder)
            )
            or 0,
        }

    await dispose_engine()

    print("seed_result=ok")
    for key, value in summary.items():
        print(f"{key}={value}")
    for key, value in totals.items():
        print(f"total_{key}={int(value)}")


def main() -> None:
    args = _parse_args()
    asyncio.run(_seed(args))


if __name__ == "__main__":
    main()
