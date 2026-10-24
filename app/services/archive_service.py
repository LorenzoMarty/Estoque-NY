"""Archive/restore for categories, products and SKUs (soft delete, issue #25).

Archiving a product also archives its SKUs, stamped with the same timestamp so that
restoring the product brings back exactly those SKUs and not ones archived earlier.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.entities import SKU, Category, Product, StockBalance

Archivable = Category | Product | SKU


async def _get(session: AsyncSession, model: Any, entity_id: int, label: str):
    entity = await session.get(model, entity_id)
    if entity is None:
        raise NotFoundError(f"{label} {entity_id} not found")
    return entity


async def _on_hand(session: AsyncSession, *sku_filters) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(StockBalance.on_hand), 0))
        .join(SKU, SKU.id == StockBalance.sku_id)
        .where(*sku_filters)
    )
    return int(total or 0)


def _require_force(label: str, units: int, reason: str | None, force: bool) -> None:
    if units <= 0:
        return
    if not force:
        raise ConflictError(
            f"{label} has {units} units on hand; archive with force=true and a reason"
        )
    if not reason:
        raise ValidationError("a reason is required to archive with stock on hand")


def _stamp(entity: Archivable, now: datetime, reason: str | None) -> None:
    entity.archived_at = now
    entity.archive_reason = reason


def _unstamp(entity: Archivable) -> None:
    entity.archived_at = None
    entity.archive_reason = None


async def archive_sku(
    session: AsyncSession, sku_id: int, *, reason: str | None, force: bool
) -> SKU:
    sku = await _get(session, SKU, sku_id, "sku")
    if sku.archived_at is not None:
        raise ConflictError(f"sku {sku_id} is already archived")
    _require_force(
        f"sku {sku_id}", await _on_hand(session, SKU.id == sku_id), reason, force
    )
    _stamp(sku, datetime.now(UTC), reason)
    await session.flush()
    return sku


async def restore_sku(session: AsyncSession, sku_id: int) -> SKU:
    sku = await _get(session, SKU, sku_id, "sku")
    if sku.archived_at is None:
        raise ConflictError(f"sku {sku_id} is not archived")
    product = await session.get(Product, sku.product_id)
    if product is not None and product.archived_at is not None:
        raise ConflictError("restore the product first")
    _unstamp(sku)
    await session.flush()
    return sku


async def archive_product(
    session: AsyncSession, product_id: int, *, reason: str | None, force: bool
) -> Product:
    product = await _get(session, Product, product_id, "product")
    if product.archived_at is not None:
        raise ConflictError(f"product {product_id} is already archived")
    units = await _on_hand(
        session, SKU.product_id == product_id, SKU.archived_at.is_(None)
    )
    _require_force(f"product {product_id}", units, reason, force)
    now = datetime.now(UTC)
    _stamp(product, now, reason)
    for sku in await session.scalars(
        select(SKU).where(SKU.product_id == product_id, SKU.archived_at.is_(None))
    ):
        _stamp(sku, now, reason)
    await session.flush()
    return product


async def restore_product(session: AsyncSession, product_id: int) -> Product:
    product = await _get(session, Product, product_id, "product")
    if product.archived_at is None:
        raise ConflictError(f"product {product_id} is not archived")
    for sku in await session.scalars(
        select(SKU).where(
            SKU.product_id == product_id, SKU.archived_at == product.archived_at
        )
    ):
        _unstamp(sku)
    _unstamp(product)
    await session.flush()
    return product


async def archive_category(
    session: AsyncSession, category_id: int, *, reason: str | None
) -> Category:
    category = await _get(session, Category, category_id, "category")
    if category.archived_at is not None:
        raise ConflictError(f"category {category_id} is already archived")
    live = await session.scalar(
        select(func.count())
        .select_from(Product)
        .where(Product.category_id == category_id, Product.archived_at.is_(None))
    )
    if live:
        raise ConflictError(f"category {category_id} still has {live} active products")
    _stamp(category, datetime.now(UTC), reason)
    await session.flush()
    return category


async def restore_category(session: AsyncSession, category_id: int) -> Category:
    category = await _get(session, Category, category_id, "category")
    if category.archived_at is None:
        raise ConflictError(f"category {category_id} is not archived")
    _unstamp(category)
    await session.flush()
    return category
