from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.entities import SKU, Branch, Location, StockBalance, StockMove
from app.models.enums import MoveType


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
) -> tuple[StockMove, StockBalance]:
    if qty_delta == 0:
        raise ValidationError("qty_delta must be non-zero")

    move_occurred_at = occurred_at or datetime.now(UTC)
    move: StockMove | None = None
    balance: StockBalance | None = None

    try:
        async with session.begin():
            branch_exists = await session.scalar(
                select(Branch.id).where(Branch.id == branch_id)
            )
            if branch_exists is None:
                raise NotFoundError(f"branch {branch_id} not found")

            sku_exists = await session.scalar(select(SKU.id).where(SKU.id == sku_id))
            if sku_exists is None:
                raise NotFoundError(f"sku {sku_id} not found")

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

            # Upsert guarantees a balance row exists before the explicit lock.
            await session.execute(
                insert(StockBalance)
                .values(
                    branch_id=branch_id,
                    sku_id=sku_id,
                    on_hand=0,
                )
                .on_conflict_do_nothing(
                    index_elements=["branch_id", "sku_id"],
                )
            )

            balance = await session.scalar(
                select(StockBalance)
                .where(
                    StockBalance.branch_id == branch_id,
                    StockBalance.sku_id == sku_id,
                )
                .with_for_update()
            )
            if balance is None:
                raise ConflictError("failed to lock stock balance")

            balance.on_hand += qty_delta
            balance.updated_at = datetime.now(UTC)

            move = StockMove(
                branch_id=branch_id,
                sku_id=sku_id,
                location_id=location_id,
                move_type=move_type,
                qty=qty_delta,
                occurred_at=move_occurred_at,
                reason=reason,
                reference_id=reference_id,
            )
            session.add(move)
            await session.flush()
            await session.refresh(move)

    except IntegrityError as exc:
        raise ConflictError("movement conflicts with existing reference_id") from exc

    if move is None or balance is None:
        raise ConflictError("movement was not persisted")

    return move, balance
