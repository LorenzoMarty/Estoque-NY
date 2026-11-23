from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import BusinessRuleError, NotFoundError, ValidationError
from app.domain.stock_engine import apply_move
from app.models.entities import Location, TransferOrder, TransferOrderItem
from app.models.enums import MoveType, TransferStatus
from app.schemas.transfer import TransferCreateIn


@asynccontextmanager
async def _transaction_scope(session: AsyncSession) -> AsyncIterator[None]:
    if session.in_transaction():
        yield
        return

    async with session.begin():
        yield


async def create_transfer(
    session: AsyncSession,
    *,
    payload: TransferCreateIn,
    user_id: int | None,
) -> TransferOrder:
    if not payload.items:
        raise ValidationError("transfer items cannot be empty")
    for item in payload.items:
        if item.qty <= 0:
            raise ValidationError("all item quantities must be greater than zero")

    if (
        payload.from_branch_id == payload.to_branch_id
        and payload.from_location_id == payload.to_location_id
    ):
        raise ValidationError("origin and destination must be different")

    async with _transaction_scope(session):
        await _validate_location_belongs_to_branch(
            session=session,
            location_id=payload.from_location_id,
            branch_id=payload.from_branch_id,
        )
        await _validate_location_belongs_to_branch(
            session=session,
            location_id=payload.to_location_id,
            branch_id=payload.to_branch_id,
        )

        transfer = TransferOrder(
            from_branch_id=payload.from_branch_id,
            from_location_id=payload.from_location_id,
            to_branch_id=payload.to_branch_id,
            to_location_id=payload.to_location_id,
            status=TransferStatus.DRAFT,
            note=payload.note,
            created_by=user_id,
        )
        session.add(transfer)
        await session.flush()

        for item in payload.items:
            session.add(
                TransferOrderItem(
                    transfer_id=transfer.id,
                    sku_id=item.sku_id,
                    qty=item.qty,
                )
            )

        await session.flush()
        await session.refresh(transfer)

    return transfer


async def ship_transfer(
    session: AsyncSession,
    *,
    transfer_id: int,
    user_id: int | None,
) -> TransferOrder:
    async with _transaction_scope(session):
        transfer = await session.scalar(
            select(TransferOrder)
            .where(TransferOrder.id == transfer_id)
            .with_for_update()
        )
        if transfer is None:
            raise NotFoundError(f"transfer {transfer_id} not found")
        if transfer.status != TransferStatus.DRAFT:
            raise BusinessRuleError("only DRAFT transfers can be shipped")

        items = list(
            (
                await session.scalars(
                    select(TransferOrderItem).where(
                        TransferOrderItem.transfer_id == transfer.id
                    )
                )
            ).all()
        )
        if not items:
            raise ValidationError("transfer has no items")

        for item in items:
            await apply_move(
                session=session,
                branch_id=transfer.from_branch_id,
                sku_id=item.sku_id,
                qty_delta=-item.qty,
                move_type=MoveType.TRANSFER_SHIP,
                reason="TRANSFER_SHIP",
                location_id=transfer.from_location_id,
                transfer_id=transfer.id,
                created_by=user_id,
            )

        transfer.status = TransferStatus.SHIPPED
        transfer.shipped_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(transfer)

    return transfer


async def receive_transfer(
    session: AsyncSession,
    *,
    transfer_id: int,
    user_id: int | None,
    received: dict[int, int] | None = None,
    reason: str | None = None,
) -> TransferOrder:
    """Receive a SHIPPED transfer; ``received`` maps sku_id to the counted qty.

    A shortfall is booked as a TRANSFER_RECEIVE of the shipped qty plus an
    ADJUSTMENT for the missing units, so the ledger shows both and the origin's
    ship move still balances. More than shipped is rejected.
    """
    received = received or {}
    async with _transaction_scope(session):
        transfer = await session.scalar(
            select(TransferOrder)
            .where(TransferOrder.id == transfer_id)
            .with_for_update()
        )
        if transfer is None:
            raise NotFoundError(f"transfer {transfer_id} not found")
        if transfer.status != TransferStatus.SHIPPED:
            raise BusinessRuleError("only SHIPPED transfers can be received")

        items = list(
            (
                await session.scalars(
                    select(TransferOrderItem).where(
                        TransferOrderItem.transfer_id == transfer.id
                    )
                )
            ).all()
        )
        if not items:
            raise ValidationError("transfer has no items")

        by_sku = {item.sku_id: item for item in items}
        unknown = set(received) - set(by_sku)
        if unknown:
            raise ValidationError(f"skus not in transfer: {sorted(unknown)}")
        for sku_id, qty in received.items():
            if not 0 <= qty <= by_sku[sku_id].qty:
                raise ValidationError(
                    f"received_qty for sku {sku_id} must be between 0 and "
                    f"{by_sku[sku_id].qty}"
                )
        short = any(received.get(i.sku_id, i.qty) < i.qty for i in items)
        if short and not (reason and reason.strip()):
            raise ValidationError("a reason is required when receiving less")

        for item in items:
            item.received_qty = received.get(item.sku_id, item.qty)
            await apply_move(
                session=session,
                branch_id=transfer.to_branch_id,
                sku_id=item.sku_id,
                qty_delta=item.qty,
                move_type=MoveType.TRANSFER_RECEIVE,
                reason="TRANSFER_RECEIVE",
                location_id=transfer.to_location_id,
                transfer_id=transfer.id,
                created_by=user_id,
            )
            if item.received_qty < item.qty:
                await apply_move(
                    session=session,
                    branch_id=transfer.to_branch_id,
                    sku_id=item.sku_id,
                    qty_delta=item.received_qty - item.qty,
                    move_type=MoveType.ADJUSTMENT,
                    reason=f"TRANSFER_DISCREPANCY: {reason}",
                    reason_code="OTHER",
                    location_id=transfer.to_location_id,
                    transfer_id=transfer.id,
                    created_by=user_id,
                )
        transfer.discrepancy_reason = reason.strip() if short and reason else None

        transfer.status = TransferStatus.RECEIVED
        transfer.received_at = datetime.now(UTC)
        await session.flush()
        await session.refresh(transfer)

    return transfer


async def cancel_transfer(
    session: AsyncSession,
    *,
    transfer_id: int,
) -> TransferOrder:
    async with _transaction_scope(session):
        transfer = await session.scalar(
            select(TransferOrder)
            .where(TransferOrder.id == transfer_id)
            .with_for_update()
        )
        if transfer is None:
            raise NotFoundError(f"transfer {transfer_id} not found")

        if transfer.status == TransferStatus.DRAFT:
            transfer.status = TransferStatus.CANCELLED
            await session.flush()
            await session.refresh(transfer)
            return transfer

        if transfer.status == TransferStatus.SHIPPED:
            raise BusinessRuleError(
                "cannot cancel SHIPPED transfer; receive first and then "
                "create reverse move"
            )

        if transfer.status == TransferStatus.RECEIVED:
            raise BusinessRuleError("cannot cancel RECEIVED transfer")

        raise BusinessRuleError("transfer already cancelled")


async def _validate_location_belongs_to_branch(
    *,
    session: AsyncSession,
    location_id: int,
    branch_id: int,
) -> None:
    location = await session.scalar(
        select(Location).where(
            Location.id == location_id, Location.branch_id == branch_id
        )
    )
    if location is None:
        raise NotFoundError(f"location {location_id} not found for branch {branch_id}")
