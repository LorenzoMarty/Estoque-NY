from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import get_settings
from app.domain.errors import (
    BusinessRuleError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.models.entities import SKU, Branch, Location, StockBalance, StockMove
from app.models.enums import MoveType


def moving_average_cost(
    on_hand: int, cost: Decimal, qty: int, unit_cost: Decimal
) -> Decimal:
    """New SKU cost after receiving `qty` units at `unit_cost` (rounded to cents).

    Without stock on hand (or with a negative balance) the receipt sets the cost.
    """
    if on_hand <= 0:
        return Decimal(unit_cost).quantize(Decimal("0.01"))
    total = (on_hand * Decimal(cost) + qty * Decimal(unit_cost)) / (on_hand + qty)
    return total.quantize(Decimal("0.01"))


async def apply_move(
    session: AsyncSession,
    branch_id: int,
    sku_id: int,
    qty_delta: int,
    move_type: MoveType,
    reason: str | None = None,
    reference_id: str | None = None,
    occurred_at: datetime | None = None,
    location_id: int | None = None,
    transfer_id: int | None = None,
    inventory_count_id: int | None = None,
    created_by: int | None = None,
    allow_inactive_sku: bool = False,
    unit_cost: Decimal | None = None,
    reason_code: str | None = None,
) -> tuple[StockMove, StockBalance]:
    if qty_delta == 0:
        raise ValidationError("qty_delta must be non-zero")

    if session.in_transaction():
        return await _apply_move_inner(
            session=session,
            branch_id=branch_id,
            sku_id=sku_id,
            qty_delta=qty_delta,
            move_type=move_type,
            reason=reason,
            reference_id=reference_id,
            occurred_at=occurred_at,
            location_id=location_id,
            transfer_id=transfer_id,
            inventory_count_id=inventory_count_id,
            created_by=created_by,
            allow_inactive_sku=allow_inactive_sku,
            unit_cost=unit_cost,
            reason_code=reason_code,
        )

    async with session.begin():
        return await _apply_move_inner(
            session=session,
            branch_id=branch_id,
            sku_id=sku_id,
            qty_delta=qty_delta,
            move_type=move_type,
            reason=reason,
            reference_id=reference_id,
            occurred_at=occurred_at,
            location_id=location_id,
            transfer_id=transfer_id,
            inventory_count_id=inventory_count_id,
            created_by=created_by,
            allow_inactive_sku=allow_inactive_sku,
            unit_cost=unit_cost,
            reason_code=reason_code,
        )


async def _apply_move_inner(
    *,
    session: AsyncSession,
    branch_id: int,
    sku_id: int,
    qty_delta: int,
    move_type: MoveType,
    reason: str | None,
    reference_id: str | None,
    occurred_at: datetime | None,
    location_id: int | None,
    transfer_id: int | None,
    inventory_count_id: int | None,
    created_by: int | None,
    allow_inactive_sku: bool,
    unit_cost: Decimal | None = None,
    reason_code: str | None = None,
) -> tuple[StockMove, StockBalance]:
    settings = get_settings()
    move_occurred_at = occurred_at or datetime.now(UTC)

    branch_exists = await session.scalar(
        select(Branch.id).where(Branch.id == branch_id)
    )
    if branch_exists is None:
        raise NotFoundError(f"branch {branch_id} not found")

    sku_query = select(SKU).where(SKU.id == sku_id)
    if unit_cost is not None:
        sku_query = sku_query.with_for_update()  # serialize cost updates per SKU
    sku = await session.scalar(sku_query)
    if sku is None:
        raise NotFoundError(f"sku {sku_id} not found")
    if not sku.active and not allow_inactive_sku:
        raise BusinessRuleError("cannot move inactive sku")
    incoming_new_stock = qty_delta > 0 and move_type != MoveType.TRANSFER_RECEIVE
    if sku.archived_at is not None and incoming_new_stock and not allow_inactive_sku:
        # Stock already there may still leave (write-off, sale) and stock already in
        # transit may land; nothing new comes in.
        raise BusinessRuleError("cannot add stock to an archived sku")

    resolved_location_id = await _resolve_location_id(
        session=session,
        branch_id=branch_id,
        location_id=location_id,
    )

    try:
        await session.execute(
            insert(StockBalance)
            .values(
                branch_id=branch_id,
                sku_id=sku_id,
                location_id=resolved_location_id,
                on_hand=0,
            )
            .on_conflict_do_nothing(
                index_elements=["branch_id", "sku_id", "location_id"],
            )
        )

        balance = await session.scalar(
            select(StockBalance)
            .where(
                StockBalance.branch_id == branch_id,
                StockBalance.sku_id == sku_id,
                StockBalance.location_id == resolved_location_id,
            )
            .with_for_update()
        )
        if balance is None:
            raise ConflictError("failed to lock stock balance")

        new_on_hand = balance.on_hand + qty_delta
        if not settings.allow_negative_stock and new_on_hand < 0:
            raise ConflictError(
                "insufficient stock for "
                f"sku {sku_id} in location {resolved_location_id}"
            )

        if unit_cost is not None and move_type == MoveType.RECEIPT:
            on_hand_now = await session.scalar(
                # Negative balances (ALLOW_NEGATIVE_STOCK) must not offset real stock.
                select(
                    func.coalesce(
                        func.sum(
                            case((StockBalance.on_hand > 0, StockBalance.on_hand))
                        ),
                        0,
                    )
                ).where(StockBalance.sku_id == sku_id)
            )
            sku.cost = moving_average_cost(
                int(on_hand_now or 0), sku.cost, qty_delta, unit_cost
            )

        balance.on_hand = new_on_hand
        balance.updated_at = datetime.now(UTC)

        move = StockMove(
            branch_id=branch_id,
            sku_id=sku_id,
            location_id=resolved_location_id,
            transfer_id=transfer_id,
            inventory_count_id=inventory_count_id,
            created_by=created_by,
            move_type=move_type,
            qty=qty_delta,
            occurred_at=move_occurred_at,
            reason=reason,
            reason_code=reason_code,
            reference_id=reference_id,
        )
        session.add(move)
        await session.flush()
        await session.refresh(move)

    except IntegrityError as exc:
        raise ConflictError("movement conflicts with existing reference_id") from exc

    return move, balance


async def _resolve_location_id(
    *,
    session: AsyncSession,
    branch_id: int,
    location_id: int | None,
) -> int:
    if location_id is not None:
        location_exists = await session.scalar(
            select(Location.id).where(
                Location.id == location_id,
                Location.branch_id == branch_id,
            )
        )
        if location_exists is None:
            raise NotFoundError(
                f"location {location_id} not found for branch {branch_id}"
            )
        return location_id

    candidate_locations = list(
        (
            await session.scalars(
                select(Location.id)
                .where(Location.branch_id == branch_id)
                .order_by(Location.id)
            )
        ).all()
    )
    if len(candidate_locations) == 1:
        return candidate_locations[0]

    if not candidate_locations:
        raise ValidationError(
            f"branch {branch_id} has no location; provide location_id explicitly"
        )
    raise ValidationError(
        f"branch {branch_id} has multiple locations; location_id is required"
    )
