from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import BusinessRuleError, NotFoundError, ValidationError
from app.domain.stock_engine import apply_move
from app.models.entities import (
    SKU,
    InventoryCount,
    InventoryCountLine,
    Location,
    StockBalance,
)
from app.models.enums import InventoryCountStatus, MoveType
from app.schemas.inventory import InventoryCountCreateIn, InventoryCountPatchLinesIn


@asynccontextmanager
async def _transaction_scope(session: AsyncSession) -> AsyncIterator[None]:
    if session.in_transaction():
        yield
        return

    async with session.begin():
        yield


async def create_inventory_count(
    session: AsyncSession,
    *,
    payload: InventoryCountCreateIn,
    user_id: int | None,
) -> InventoryCount:
    async with _transaction_scope(session):
        await _validate_location_branch(
            session=session,
            location_id=payload.location_id,
            branch_id=payload.branch_id,
        )

        scope = payload.scope.upper()
        if scope not in {"ALL", "SKUS"}:
            raise ValidationError("scope must be ALL or SKUS")

        count = InventoryCount(
            branch_id=payload.branch_id,
            location_id=payload.location_id,
            status=InventoryCountStatus.OPEN,
            created_by=user_id,
        )
        session.add(count)
        await session.flush()

        sku_ids = await _resolve_scope_skus(session=session, payload=payload)
        for sku_id in sku_ids:
            system_qty = await _system_qty(
                session=session,
                branch_id=payload.branch_id,
                location_id=payload.location_id,
                sku_id=sku_id,
            )
            session.add(
                InventoryCountLine(
                    count_id=count.id,
                    sku_id=sku_id,
                    system_qty=system_qty,
                    counted_qty=None,
                    diff_qty=0,
                )
            )

        await session.flush()
        await session.refresh(count)

    return count


async def patch_inventory_lines(
    session: AsyncSession,
    *,
    count_id: int,
    payload: InventoryCountPatchLinesIn,
) -> InventoryCount:
    async with _transaction_scope(session):
        count = await session.scalar(
            select(InventoryCount)
            .where(InventoryCount.id == count_id)
            .with_for_update()
        )
        if count is None:
            raise NotFoundError(f"inventory count {count_id} not found")
        if count.status != InventoryCountStatus.OPEN:
            raise BusinessRuleError("only OPEN inventory counts can be edited")

        for line_payload in payload.lines:
            line = await session.scalar(
                select(InventoryCountLine).where(
                    InventoryCountLine.count_id == count.id,
                    InventoryCountLine.sku_id == line_payload.sku_id,
                )
            )
            if line is None:
                raise NotFoundError(
                    f"sku {line_payload.sku_id} not found in inventory count {count.id}"
                )
            line.counted_qty = line_payload.counted_qty
            line.diff_qty = line_payload.counted_qty - line.system_qty

        await session.flush()
        await session.refresh(count)

    return count


async def close_inventory_count(
    session: AsyncSession,
    *,
    count_id: int,
) -> InventoryCount:
    async with _transaction_scope(session):
        count = await session.scalar(
            select(InventoryCount)
            .where(InventoryCount.id == count_id)
            .with_for_update()
        )
        if count is None:
            raise NotFoundError(f"inventory count {count_id} not found")
        if count.status != InventoryCountStatus.OPEN:
            raise BusinessRuleError("only OPEN inventory counts can be closed")

        count.status = InventoryCountStatus.CLOSED
        count.closed_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(count)

    return count


async def post_inventory_count(
    session: AsyncSession,
    *,
    count_id: int,
    user_id: int | None,
) -> InventoryCount:
    async with _transaction_scope(session):
        count = await session.scalar(
            select(InventoryCount)
            .where(InventoryCount.id == count_id)
            .with_for_update()
        )
        if count is None:
            raise NotFoundError(f"inventory count {count_id} not found")
        if count.status != InventoryCountStatus.CLOSED:
            raise BusinessRuleError("only CLOSED inventory counts can be posted")

        lines = list(
            (
                await session.scalars(
                    select(InventoryCountLine).where(
                        InventoryCountLine.count_id == count.id
                    )
                )
            ).all()
        )
        for line in lines:
            if line.counted_qty is None:
                raise BusinessRuleError(
                    "sku "
                    f"{line.sku_id} has no counted_qty in inventory count "
                    f"{count.id}"
                )

        for line in lines:
            if line.diff_qty == 0:
                line.posted = True
                continue

            await apply_move(
                session=session,
                branch_id=count.branch_id,
                sku_id=line.sku_id,
                qty_delta=line.diff_qty,
                move_type=MoveType.ADJUSTMENT,
                reason="INVENTORY_COUNT",
                location_id=count.location_id,
                inventory_count_id=count.id,
                created_by=user_id,
                allow_inactive_sku=True,
            )
            line.posted = True

        count.status = InventoryCountStatus.POSTED
        count.posted_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(count)

    return count


async def cancel_inventory_count(
    session: AsyncSession,
    *,
    count_id: int,
) -> InventoryCount:
    async with _transaction_scope(session):
        count = await session.scalar(
            select(InventoryCount)
            .where(InventoryCount.id == count_id)
            .with_for_update()
        )
        if count is None:
            raise NotFoundError(f"inventory count {count_id} not found")
        if count.status == InventoryCountStatus.POSTED:
            raise BusinessRuleError("cannot cancel a POSTED inventory count")
        if count.status == InventoryCountStatus.CANCELLED:
            raise BusinessRuleError("inventory count already cancelled")

        count.status = InventoryCountStatus.CANCELLED
        count.cancelled_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(count)

    return count


async def _validate_location_branch(
    *,
    session: AsyncSession,
    location_id: int,
    branch_id: int,
) -> None:
    location = await session.scalar(
        select(Location.id).where(
            Location.id == location_id, Location.branch_id == branch_id
        )
    )
    if location is None:
        raise NotFoundError(f"location {location_id} not found for branch {branch_id}")


async def _resolve_scope_skus(
    *,
    session: AsyncSession,
    payload: InventoryCountCreateIn,
) -> list[int]:
    if payload.scope.upper() == "SKUS":
        if not payload.sku_ids:
            raise ValidationError("sku_ids is required when scope=SKUS")
        skus = list(
            (
                await session.scalars(
                    select(SKU.id).where(SKU.id.in_(set(payload.sku_ids)))
                )
            ).all()
        )
        if len(skus) != len(set(payload.sku_ids)):
            raise NotFoundError("one or more skus not found")
        return skus

    skus_with_balance = list(
        (
            await session.scalars(
                select(StockBalance.sku_id)
                .where(
                    StockBalance.branch_id == payload.branch_id,
                    StockBalance.location_id == payload.location_id,
                )
                .distinct()
            )
        ).all()
    )
    return skus_with_balance


async def _system_qty(
    *,
    session: AsyncSession,
    branch_id: int,
    location_id: int,
    sku_id: int,
) -> int:
    value = await session.scalar(
        select(StockBalance.on_hand).where(
            StockBalance.branch_id == branch_id,
            StockBalance.location_id == location_id,
            StockBalance.sku_id == sku_id,
        )
    )
    return int(value or 0)
