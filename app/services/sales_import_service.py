"""Import sales from an external POS or spreadsheet (issue #33).

Each sale is its own unit: one bad sale (unknown SKU, not enough stock) is reported and
skipped, the rest go in. Re-importing the same file changes nothing, because a sale is
identified by (source, external_id) and an existing one is reported as `duplicate`.

CSV, one line per item (header required, `,` or `;`):
    external_id, branch_id, sold_at, sku_code, qty, unit_price [, customer_id]
"""

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import DomainError
from app.domain.sales import create_sale
from app.models.entities import SKU, Sale

REQUIRED = ("external_id", "branch_id", "sold_at", "sku_code", "qty")


@dataclass
class ImportReport:
    dry_run: bool
    created: list[str] = field(default_factory=list)
    duplicates: list[str] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "dry_run": self.dry_run,
            "totals": {
                "created": len(self.created),
                "duplicates": len(self.duplicates),
                "errors": len(self.errors),
            },
            "created": self.created,
            "duplicates": self.duplicates,
            "errors": self.errors,
        }


def parse_csv(text: str) -> tuple[dict[str, dict], list[dict]]:
    """Group lines into sales keyed by external_id; bad lines become errors."""
    dialect = ";" if text.splitlines()[:1] and ";" in text.splitlines()[0] else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=dialect)
    missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
    if missing:
        return {}, [{"line": 1, "error": f"missing columns: {', '.join(missing)}"}]
    sales: dict[str, dict] = {}
    errors: list[dict] = []
    for line, row in enumerate(reader, start=2):
        try:
            ext = row["external_id"].strip()
            if not ext:
                raise ValueError("external_id is empty")
            sale = sales.setdefault(
                ext,
                {
                    "branch_id": int(row["branch_id"]),
                    "sold_at": datetime.fromisoformat(row["sold_at"].strip()),
                    "customer_id": int(row["customer_id"])
                    if (row.get("customer_id") or "").strip()
                    else None,
                    "items": [],
                    "line": line,
                },
            )
            price = (row.get("unit_price") or "").strip().replace(",", ".")
            sale["items"].append(
                (
                    row["sku_code"].strip(),
                    int(row["qty"]),
                    Decimal(price) if price else None,
                )
            )
        except (ValueError, InvalidOperation) as exc:
            errors.append({"line": line, "error": str(exc)})
    return sales, errors


async def import_sales(
    session: AsyncSession,
    source: str,
    sales: dict[str, dict],
    *,
    dry_run: bool,
    user_id: int | None,
    allowed_branch=lambda branch_id: True,
    prior_errors: list[dict] | None = None,
) -> ImportReport:
    """`sales`: external_id -> {branch_id, sold_at, customer_id, items}."""
    report = ImportReport(dry_run=dry_run, errors=list(prior_errors or []))
    for ext, data in sales.items():
        if await session.scalar(
            select(Sale.id).where(Sale.source == source, Sale.external_id == ext)
        ):
            report.duplicates.append(ext)
            continue
        if not allowed_branch(data["branch_id"]):
            report.errors.append({"external_id": ext, "error": "branch not allowed"})
            continue
        try:
            async with session.begin_nested() as nested:
                items = []
                for sku_code, qty, price in data["items"]:
                    sku_id = await session.scalar(
                        select(SKU.id).where(SKU.sku_code == sku_code)
                    )
                    if sku_id is None:
                        raise DomainError(f"unknown sku_code {sku_code}")
                    items.append((sku_id, qty, price))
                await create_sale(
                    session,
                    branch_id=data["branch_id"],
                    items=items,
                    customer_id=data.get("customer_id"),
                    sold_at=data["sold_at"],
                    source=source,
                    external_id=ext,
                    created_by=user_id,
                )
                if dry_run:
                    await nested.rollback()
            report.created.append(ext)
        except DomainError as exc:
            report.errors.append({"external_id": ext, "error": exc.message})
    return report
