"""CSV import and export of products, SKUs and opening stock.

One row = one SKU, optionally with the opening stock it holds in one branch/location.
The same columns are used for export, so an exported file can be imported again.

Import rules:
- a product is matched by name (case-insensitive), a brand/category by name, a SKU by
  `sku_code`; missing ones are created, existing SKUs are updated when a field differs;
- opening stock is only applied when that SKU has **no stock history yet** in that
  branch, so importing the same file again never duplicates stock or SKUs;
- `dry_run` validates and reports what would change without writing anything;
- `mode="partial"` applies the valid rows and lists the bad ones;
  `mode="all_or_nothing"` applies nothing if any row is bad.
"""

import csv
import io
from dataclasses import asdict, dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, ValidationError
from app.domain.stock_engine import apply_move
from app.models.entities import (
    SKU,
    Branch,
    Brand,
    Category,
    Location,
    Product,
    StockBalance,
    StockMove,
)
from app.models.enums import MoveType

COLUMNS = [
    "product_name",
    "brand",
    "category",
    "sku_code",
    "sku_name",
    "barcode",
    "unit",
    "cost",
    "price",
    "branch",
    "location",
    "opening_qty",
]
REQUIRED = ("product_name", "sku_code")
MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
Mode = Literal["partial", "all_or_nothing"]


@dataclass
class RowError:
    row: int  # line number in the file; the header is line 1
    field: str | None
    message: str


@dataclass
class Row:
    line: int
    product_name: str
    brand: str
    category: str
    sku_code: str
    sku_name: str
    barcode: str
    unit: str
    cost: Decimal | None
    price: Decimal | None
    branch: str
    location: str
    opening_qty: int | None
    branch_id: int | None = None
    location_id: int | None = None


@dataclass
class Totals:
    rows: int = 0
    valid_rows: int = 0
    created_products: int = 0
    created_skus: int = 0
    updated_skus: int = 0
    unchanged_skus: int = 0
    opening_stock_applied: int = 0
    opening_stock_skipped: int = 0
    errors: int = 0


@dataclass
class ImportReport:
    dry_run: bool
    mode: str
    applied: bool = False
    totals: Totals = field(default_factory=Totals)
    errors: list[RowError] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def _decimal(
    value: str, name: str, errors: list[RowError], line: int
) -> Decimal | None:
    if not value:
        return None
    try:
        number = Decimal(value.replace(",", "."))
    except InvalidOperation:
        errors.append(RowError(line, name, f"{name} is not a number: {value!r}"))
        return None
    if number < 0:
        errors.append(RowError(line, name, f"{name} cannot be negative"))
        return None
    return number


def _read_rows(text: str) -> tuple[list[Row], list[RowError], int]:
    """Parse the CSV into rows; returns (rows, errors, total data rows)."""
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValidationError(f"file is larger than {MAX_BYTES // (1024 * 1024)} MB")
    text = text.lstrip("﻿")
    first_line = text.splitlines()[0] if text.strip() else ""
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    header = [(name or "").strip().lower() for name in (reader.fieldnames or [])]
    missing = [column for column in REQUIRED if column not in header]
    if missing:
        raise ValidationError(f"missing required columns: {', '.join(missing)}")
    reader.fieldnames = header

    rows: list[Row] = []
    errors: list[RowError] = []
    total = 0
    for raw in reader:
        if not any((value or "").strip() for value in raw.values()):
            continue  # blank line
        total += 1
        if total > MAX_ROWS:
            raise ValidationError(f"more than {MAX_ROWS} rows; split the file")
        line = reader.line_num
        cell = {column: (raw.get(column) or "").strip() for column in COLUMNS}
        before = len(errors)
        for column in REQUIRED:
            if not cell[column]:
                errors.append(RowError(line, column, f"{column} is required"))
        cost = _decimal(cell["cost"], "cost", errors, line)
        price = _decimal(cell["price"], "price", errors, line)
        quantity: int | None = None
        if cell["opening_qty"]:
            try:
                quantity = int(cell["opening_qty"])
                if quantity < 0:
                    raise ValueError
            except ValueError:
                errors.append(
                    RowError(
                        line, "opening_qty", "opening_qty must be a whole number >= 0"
                    )
                )
        if quantity is not None and not cell["branch"]:
            errors.append(
                RowError(line, "branch", "branch is required with opening_qty")
            )
        if len(errors) == before:
            rows.append(
                Row(
                    line=line,
                    product_name=cell["product_name"],
                    brand=cell["brand"],
                    category=cell["category"],
                    sku_code=cell["sku_code"],
                    sku_name=cell["sku_name"],
                    barcode=cell["barcode"],
                    unit=(cell["unit"] or "UN").upper(),
                    cost=cost,
                    price=price,
                    branch=cell["branch"],
                    location=cell["location"],
                    opening_qty=quantity,
                )
            )
    return rows, errors, total


async def _resolve_stock_targets(
    session: AsyncSession, rows: list[Row], errors: list[RowError]
) -> list[Row]:
    """Fill branch_id and location_id; unknown ones turn the row into an error."""
    branches = {
        b.name.lower(): b.id for b in (await session.scalars(select(Branch))).all()
    }
    by_branch: dict[int, dict[str, int]] = {}
    for location in (await session.scalars(select(Location))).all():
        by_branch.setdefault(location.branch_id, {})[location.name.lower()] = (
            location.id
        )

    good: list[Row] = []
    for row in rows:
        if row.opening_qty is None:
            good.append(row)
            continue
        branch_id = branches.get(row.branch.lower())
        if branch_id is None:
            errors.append(
                RowError(row.line, "branch", f"unknown branch {row.branch!r}")
            )
            continue
        locations = by_branch.get(branch_id, {})
        if row.location:
            location_id = locations.get(row.location.lower())
            if location_id is None:
                errors.append(
                    RowError(
                        row.line,
                        "location",
                        f"branch {row.branch!r} has no location {row.location!r}",
                    )
                )
                continue
        elif len(locations) == 1:
            location_id = next(iter(locations.values()))
        else:
            errors.append(
                RowError(
                    row.line,
                    "location",
                    f"branch {row.branch!r} has {len(locations)} locations; "
                    "set location",
                )
            )
            continue
        row.branch_id, row.location_id = branch_id, location_id
        good.append(row)
    return good


def _check_consistency(rows: list[Row], errors: list[RowError]) -> list[Row]:
    """Rows of one SKU must agree on its own data and not repeat a stock line."""
    first: dict[str, Row] = {}
    seen_stock: set[tuple[str, int, int]] = set()
    good: list[Row] = []
    for row in rows:
        base = first.setdefault(row.sku_code, row)
        problem = None
        for name in ("product_name", "brand", "category", "unit", "cost", "price"):
            if getattr(row, name) != getattr(base, name):
                problem = f"{name} differs from line {base.line} for the same sku_code"
                break
        if problem is None and row.opening_qty is not None:
            key = (row.sku_code, row.branch_id or 0, row.location_id or 0)
            if key in seen_stock:
                problem = "this SKU already has a stock line for that branch/location"
            seen_stock.add(key)
        if problem:
            errors.append(RowError(row.line, None, problem))
        else:
            good.append(row)
    return good


async def import_catalog(
    session: AsyncSession,
    text: str,
    *,
    dry_run: bool,
    mode: Mode,
    user_id: int | None,
) -> ImportReport:
    report = ImportReport(dry_run=dry_run, mode=mode)
    rows, errors, total = _read_rows(text)
    report.totals.rows = total
    rows = await _resolve_stock_targets(session, rows, errors)
    rows = _check_consistency(rows, errors)
    errors.sort(key=lambda e: e.row)
    report.errors = errors
    report.totals.errors = len(errors)
    report.totals.valid_rows = len(rows)

    will_apply = not dry_run and not (mode == "all_or_nothing" and errors)
    await _plan_and_apply(session, rows, report, apply=will_apply, user_id=user_id)
    report.applied = will_apply
    if will_apply:
        await session.commit()
    return report


async def _plan_and_apply(
    session: AsyncSession,
    rows: list[Row],
    report: ImportReport,
    *,
    apply: bool,
    user_id: int | None,
) -> None:
    totals = report.totals
    brands = {b.name.lower(): b for b in (await session.scalars(select(Brand))).all()}
    categories = {
        c.name.lower(): c for c in (await session.scalars(select(Category))).all()
    }
    products = {
        p.name.lower(): p for p in (await session.scalars(select(Product))).all()
    }
    codes = {row.sku_code for row in rows}
    skus = (
        {
            s.sku_code: s
            for s in (
                await session.scalars(select(SKU).where(SKU.sku_code.in_(codes)))
            ).all()
        }
        if codes
        else {}
    )
    has_history: set[tuple[int, int]] = set()
    if skus:
        for branch_id, sku_id in (
            await session.execute(
                select(StockMove.branch_id, StockMove.sku_id)
                .where(StockMove.sku_id.in_([s.id for s in skus.values()]))
                .group_by(StockMove.branch_id, StockMove.sku_id)
            )
        ).all():
            has_history.add((branch_id, sku_id))

    done_skus: set[str] = set()
    created_products: set[str] = set()
    for row in rows:
        product = products.get(row.product_name.lower())
        if product is None and row.product_name.lower() not in created_products:
            created_products.add(row.product_name.lower())
            totals.created_products += 1
            if apply:
                brand = await _named(session, Brand, brands, row.brand)
                category = await _named(session, Category, categories, row.category)
                product = Product(
                    name=row.product_name,
                    brand=row.brand or None,
                    brand_id=brand.id if brand else None,
                    category_id=category.id if category else None,
                    active=True,
                )
                session.add(product)
                await session.flush()
                products[row.product_name.lower()] = product

        sku = skus.get(row.sku_code)
        if row.sku_code not in done_skus:
            done_skus.add(row.sku_code)
            if sku is None:
                totals.created_skus += 1
                if apply:
                    sku = SKU(
                        product_id=products[row.product_name.lower()].id,
                        sku_code=row.sku_code,
                        name=row.sku_name or None,
                        barcode=row.barcode or None,
                        unit=row.unit,
                        cost=row.cost or Decimal("0"),
                        price=row.price or Decimal("0"),
                    )
                    session.add(sku)
                    await session.flush()
                    skus[row.sku_code] = sku
            elif _update_sku(sku, row, apply=apply):
                totals.updated_skus += 1
            else:
                totals.unchanged_skus += 1

        if row.opening_qty is not None and row.branch_id is not None:
            sku = skus.get(row.sku_code)
            known = sku is not None and (row.branch_id, sku.id) in has_history
            if known or row.opening_qty == 0:
                totals.opening_stock_skipped += 1
            else:
                totals.opening_stock_applied += 1
                if apply and sku is not None:
                    try:
                        await apply_move(
                            session=session,
                            branch_id=row.branch_id,
                            sku_id=sku.id,
                            qty_delta=row.opening_qty,
                            move_type=MoveType.RECEIPT,
                            reason="OPENING_BALANCE",
                            reference_id=(
                                f"OPENING:{row.branch_id}:{row.location_id}:{row.sku_code}"
                            ),
                            location_id=row.location_id,
                            created_by=user_id,
                        )
                    except ConflictError:
                        totals.opening_stock_applied -= 1
                        totals.opening_stock_skipped += 1
                    else:
                        has_history.add((row.branch_id, sku.id))


async def _named(session: AsyncSession, model, cache: dict, name: str):
    if not name:
        return None
    found = cache.get(name.lower())
    if found is None:
        found = model(name=name)
        session.add(found)
        await session.flush()
        cache[name.lower()] = found
    return found


def _update_sku(sku: SKU, row: Row, *, apply: bool) -> bool:
    """Apply the columns the file provides; returns whether anything differs."""
    changes: dict[str, object] = {}
    if row.sku_name and row.sku_name != (sku.name or ""):
        changes["name"] = row.sku_name
    if row.barcode and row.barcode != (sku.barcode or ""):
        changes["barcode"] = row.barcode
    if row.unit != sku.unit and row.unit != "UN":
        changes["unit"] = row.unit
    if row.cost is not None and row.cost != sku.cost:
        changes["cost"] = row.cost
    if row.price is not None and row.price != sku.price:
        changes["price"] = row.price
    if apply:
        for key, value in changes.items():
            setattr(sku, key, value)
    return bool(changes)


async def export_catalog_rows(session: AsyncSession):
    """Yield CSV rows (header first), one per SKU and stocked branch/location."""
    yield COLUMNS
    stmt = (
        select(
            SKU,
            Product,
            Brand.name,
            Category.name,
            Branch.name,
            Location.name,
            StockBalance.on_hand,
        )
        .join(Product, Product.id == SKU.product_id)
        .join(Brand, Brand.id == Product.brand_id, isouter=True)
        .join(Category, Category.id == Product.category_id, isouter=True)
        .join(StockBalance, StockBalance.sku_id == SKU.id, isouter=True)
        .join(Branch, Branch.id == StockBalance.branch_id, isouter=True)
        .join(Location, Location.id == StockBalance.location_id, isouter=True)
        .order_by(SKU.sku_code, Branch.name, Location.name)
    )
    for sku, product, brand, category, branch, location, on_hand in (
        await session.execute(stmt)
    ).all():
        yield [
            product.name,
            brand or product.brand or "",
            category or "",
            sku.sku_code,
            sku.name or "",
            sku.barcode or "",
            sku.unit,
            f"{sku.cost:.2f}",
            f"{sku.price:.2f}",
            branch or "",
            location or "",
            "" if on_hand is None else on_hand,
        ]
