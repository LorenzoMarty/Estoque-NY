"""Lots and expiry: which batch a move put in or took out (issue #19).

Lots are tracked per branch and SKU (not per location). A positive move that names a
lot adds stock to it; an outgoing move takes stock from lots first-expiring-first-out
(FEFO) unless a lot is named. Stock that was never given a lot ("untracked") can still
leave: lots only ever cover part of a balance.

Transfers do not move lots, so a SKU that travels between branches arrives untracked.
"""

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.entities import Lot, LotAllocation, StockMove
from app.models.enums import MoveType

# Expiry dates are calendar days in the branches' time zone.
LOCAL_TZ = ZoneInfo("America/Sao_Paulo")


def today_local() -> date:
    return datetime.now(LOCAL_TZ).date()


# Move types tracked by lot; transfers are not (see the module docstring).
LOT_MOVE_TYPES = {MoveType.RECEIPT, MoveType.ISSUE, MoveType.ADJUSTMENT}


@dataclass
class LotSpec:
    """What the caller says about lots for one move; all optional."""

    code: str | None = None  # incoming: the lot receiving the units
    expires_on: date | None = None  # incoming: expiry, set when the lot is created
    lot_id: int | None = None  # outgoing: take from exactly this lot instead of FEFO


@dataclass
class Allocation:
    lot_id: int
    code: str
    expires_on: date | None
    qty: int  # signed, like the move


def fefo_order():
    """Soonest expiry first; lots without an expiry last; then a stable tie-break."""
    return (Lot.expires_on.is_(None), Lot.expires_on, Lot.code, Lot.id)


async def fefo_plan(
    session: AsyncSession, branch_id: int, sku_id: int, qty: int, *, lock: bool = False
) -> list[Allocation]:
    """How `qty` units would be taken: lot by lot, oldest expiry first.

    The plan may cover less than `qty`; the rest comes from untracked stock.
    """
    stmt = (
        select(Lot)
        .where(Lot.branch_id == branch_id, Lot.sku_id == sku_id, Lot.on_hand > 0)
        .order_by(*fefo_order())
    )
    if lock:
        stmt = stmt.with_for_update()
    plan: list[Allocation] = []
    remaining = qty
    for lot in await session.scalars(stmt):
        if remaining <= 0:
            break
        take = min(lot.on_hand, remaining)
        plan.append(Allocation(lot.id, lot.code, lot.expires_on, -take))
        remaining -= take
    return plan


async def allocate_lots(
    session: AsyncSession, move: StockMove, spec: LotSpec | None
) -> list[Allocation]:
    """Record the lot side of `move` (already flushed, so it has an id)."""
    spec = spec or LotSpec()
    if move.move_type not in LOT_MOVE_TYPES:
        if spec.code or spec.lot_id:
            raise ValidationError("lots are not tracked for this kind of movement")
        return []
    if move.qty > 0:
        return await _receive(session, move, spec)
    return await _issue(session, move, spec)


async def _receive(
    session: AsyncSession, move: StockMove, spec: LotSpec
) -> list[Allocation]:
    if spec.lot_id is not None:
        raise ValidationError("lot_id only applies to outgoing movements")
    if spec.expires_on is not None and not spec.code:
        raise ValidationError("expires_on needs a lot_code")
    if not spec.code:
        return []
    code = spec.code.strip()
    lot = await session.scalar(
        select(Lot)
        .where(
            Lot.branch_id == move.branch_id,
            Lot.sku_id == move.sku_id,
            Lot.code == code,
        )
        .with_for_update()
    )
    if lot is None:
        lot = Lot(
            branch_id=move.branch_id,
            sku_id=move.sku_id,
            code=code,
            expires_on=spec.expires_on,
            on_hand=0,
        )
        session.add(lot)
    elif spec.expires_on is not None and lot.expires_on != spec.expires_on:
        raise ConflictError(
            f"lot {code} already expires on {lot.expires_on}; "
            "use another lot code for a different expiry"
        )
    lot.on_hand += move.qty
    await session.flush()
    session.add(LotAllocation(move_id=move.id, lot_id=lot.id, qty=move.qty))
    return [Allocation(lot.id, lot.code, lot.expires_on, move.qty)]


async def _issue(
    session: AsyncSession, move: StockMove, spec: LotSpec
) -> list[Allocation]:
    if spec.code or spec.expires_on:
        raise ValidationError("lot_code and expires_on only apply to incoming stock")
    needed = -move.qty
    if spec.lot_id is not None:
        lot = await session.scalar(
            select(Lot).where(Lot.id == spec.lot_id).with_for_update()
        )
        if lot is None or (lot.branch_id, lot.sku_id) != (move.branch_id, move.sku_id):
            raise NotFoundError(f"lot {spec.lot_id} not found for this branch and sku")
        if lot.on_hand < needed:
            raise ConflictError(
                f"lot {lot.code} has {lot.on_hand} units, {needed} requested"
            )
        plan = [Allocation(lot.id, lot.code, lot.expires_on, -needed)]
    else:
        plan = await fefo_plan(session, move.branch_id, move.sku_id, needed, lock=True)

    for item in plan:
        lot = await session.get(Lot, item.lot_id)
        assert lot is not None
        lot.on_hand += item.qty  # item.qty is negative
        session.add(LotAllocation(move_id=move.id, lot_id=lot.id, qty=item.qty))
    return plan
