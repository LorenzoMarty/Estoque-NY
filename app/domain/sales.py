"""Sales ledger: a sale issues stock atomically; voiding puts it back (issue #32).

Functions flush but never commit: the caller owns the transaction, so a failed line
rolls the whole sale (and its stock moves) back.
"""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import BusinessRuleError, NotFoundError
from app.domain.lots import LOCAL_TZ, LotSpec
from app.domain.stock_engine import apply_move
from app.models.entities import (
    SKU,
    Branch,
    Customer,
    DailyClose,
    Lot,
    LotAllocation,
    Sale,
    SaleItem,
    StockMove,
)
from app.models.enums import MoveType

COMPLETED = "COMPLETED"
VOIDED = "VOIDED"


async def branch_tz(session: AsyncSession, branch_id: int) -> ZoneInfo:
    name = await session.scalar(select(Branch.timezone).where(Branch.id == branch_id))
    try:
        return ZoneInfo(name) if name else LOCAL_TZ
    except Exception:  # unknown zone name stored on the branch
        return LOCAL_TZ


def day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """UTC start (inclusive) and end (exclusive) of a branch-local calendar day."""
    start = datetime.combine(day, time.min, tzinfo=tz)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)


async def assert_day_open(
    session: AsyncSession, branch_id: int, when: datetime, override: bool
) -> None:
    """Sales and voids dated in a closed day need an explicit, audited override."""
    if override:
        return
    tz = await branch_tz(session, branch_id)
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    closed = await session.scalar(
        select(DailyClose.id).where(
            DailyClose.branch_id == branch_id,
            DailyClose.day == when.astimezone(tz).date(),
        )
    )
    if closed:
        raise BusinessRuleError(f"day {when.astimezone(tz).date()} is closed")


async def create_sale(
    session: AsyncSession,
    *,
    branch_id: int,
    items: list[tuple[int, int, Decimal | None]],  # (sku_id, qty, unit_price)
    location_id: int | None = None,
    customer_id: int | None = None,
    sold_at: datetime | None = None,
    source: str = "manual",
    external_id: str | None = None,
    created_by: int | None = None,
    override_closed_day: bool = False,
) -> Sale:
    when = sold_at or datetime.now(UTC)
    await assert_day_open(session, branch_id, when, override_closed_day)
    if customer_id is not None:
        customer = await session.get(Customer, customer_id)
        if customer is None or customer.anonymized_at:
            raise NotFoundError(f"customer {customer_id} not found")
    sale = Sale(
        branch_id=branch_id,
        customer_id=customer_id,
        source=source,
        external_id=external_id,
        sold_at=sold_at or datetime.now(UTC),
        created_by=created_by,
    )
    session.add(sale)
    await session.flush()

    total = Decimal("0")
    for sku_id, qty, unit_price in items:
        sku = await session.get(SKU, sku_id)
        if sku is None:
            raise NotFoundError(f"sku {sku_id} not found")
        price = sku.price if unit_price is None else unit_price
        line = SaleItem(sale_id=sale.id, sku_id=sku_id, qty=qty, unit_price=price)
        session.add(line)
        await session.flush()
        move, _ = await apply_move(
            session,
            branch_id=branch_id,
            sku_id=sku_id,
            qty_delta=-qty,
            move_type=MoveType.ISSUE,
            reason=f"sale {sale.id}",
            reference_id=f"sale-{sale.id}-{line.id}",
            occurred_at=sale.sold_at,
            location_id=location_id,
            created_by=created_by,
            lot=LotSpec(),
        )
        line.issue_move_id = move.id
        total += Decimal(price) * qty
    sale.total = total.quantize(Decimal("0.01"))
    await session.flush()
    return sale


async def void_sale(
    session: AsyncSession,
    sale: Sale,
    reason: str,
    user_id: int | None,
    override_closed_day: bool = False,
) -> Sale:
    """Put every line's stock back (into the same lots) and mark the sale voided."""
    if sale.status == VOIDED:
        raise BusinessRuleError("sale is already voided")
    await assert_day_open(session, sale.branch_id, sale.sold_at, override_closed_day)
    lines = await session.scalars(select(SaleItem).where(SaleItem.sale_id == sale.id))
    for line in lines.all():
        if line.issue_move_id is None:
            continue
        issue = await session.get(StockMove, line.issue_move_id)
        assert issue is not None
        allocs = await session.execute(
            select(Lot, LotAllocation.qty)
            .join(LotAllocation, LotAllocation.lot_id == Lot.id)
            .where(LotAllocation.move_id == issue.id)
        )
        back = [(lot, -qty) for lot, qty in allocs.all()]
        untracked = line.qty - sum(q for _, q in back)
        parts = [
            (LotSpec(code=lot.code, expires_on=lot.expires_on), q) for lot, q in back
        ]
        if untracked > 0:
            parts.append((LotSpec(), untracked))
        for n, (spec, qty) in enumerate(parts):
            await apply_move(
                session,
                branch_id=sale.branch_id,
                sku_id=line.sku_id,
                qty_delta=qty,
                move_type=MoveType.ADJUSTMENT,
                reason=f"void sale {sale.id}: {reason}"[:255],
                reference_id=f"sale-{sale.id}-{line.id}-void-{n}",
                location_id=issue.location_id,
                created_by=user_id,
                allow_inactive_sku=True,  # stock returns even if the SKU was retired
                lot=spec,
            )
    sale.status = VOIDED
    sale.voided_at = datetime.now(UTC)
    sale.void_reason = reason
    await session.flush()
    return sale
