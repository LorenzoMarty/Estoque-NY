"""Purchase orders: what was ordered from a supplier, and receiving it (issue #18).

Receiving is not a separate kind of stock movement: each delivered line becomes an
ordinary RECEIPT move (so balances, lots, moving average cost and audit all work as
they do for a manual receipt), tagged with the supplier and the order.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.lots import LotSpec
from app.domain.stock_engine import apply_move
from app.models.entities import (
    SKU,
    Branch,
    Location,
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
)
from app.models.enums import MoveType, PurchaseOrderStatus
from app.schemas.purchasing import PurchaseOrderCreate, PurchaseReceiveIn

OPEN_STATUSES = {PurchaseOrderStatus.OPEN, PurchaseOrderStatus.PARTIAL}


async def get_order(
    session: AsyncSession, order_id: int, *, lock: bool = False
) -> PurchaseOrder:
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == order_id)
    if lock:
        stmt = stmt.with_for_update()
    order = await session.scalar(stmt)
    if order is None:
        raise NotFoundError(f"purchase order {order_id} not found")
    return order


async def get_items(session: AsyncSession, order_id: int) -> list[PurchaseOrderItem]:
    rows = await session.scalars(
        select(PurchaseOrderItem)
        .where(PurchaseOrderItem.purchase_order_id == order_id)
        .order_by(PurchaseOrderItem.id)
    )
    return list(rows)


async def create_order(
    session: AsyncSession, payload: PurchaseOrderCreate, user_id: int | None
) -> PurchaseOrder:
    supplier = await session.get(Supplier, payload.supplier_id)
    if supplier is None:
        raise NotFoundError(f"supplier {payload.supplier_id} not found")
    if not supplier.active:
        raise ConflictError("supplier is inactive")
    if await session.get(Branch, payload.branch_id) is None:
        raise NotFoundError(f"branch {payload.branch_id} not found")
    if payload.location_id is not None:
        location = await session.get(Location, payload.location_id)
        if location is None or location.branch_id != payload.branch_id:
            raise ValidationError("location does not belong to the branch")
    skus = {
        sku.id: sku
        for sku in await session.scalars(
            select(SKU).where(SKU.id.in_([line.sku_id for line in payload.items]))
        )
    }
    for line in payload.items:
        sku = skus.get(line.sku_id)
        if sku is None:
            raise NotFoundError(f"sku {line.sku_id} not found")
        if sku.archived_at is not None or not sku.active:
            raise ConflictError(f"sku {sku.sku_code} cannot be ordered (inactive)")

    order = PurchaseOrder(
        supplier_id=payload.supplier_id,
        branch_id=payload.branch_id,
        location_id=payload.location_id,
        reference=payload.reference,
        expected_on=payload.expected_on,
        status=PurchaseOrderStatus.OPEN,
        created_by=user_id,
    )
    session.add(order)
    await session.flush()
    for line in payload.items:
        session.add(
            PurchaseOrderItem(
                purchase_order_id=order.id,
                sku_id=line.sku_id,
                qty_ordered=line.qty,
                qty_received=0,
                unit_cost=line.unit_cost,
            )
        )
    await session.flush()
    return order


def _status_of(items: list[PurchaseOrderItem]) -> PurchaseOrderStatus:
    if all(item.qty_received >= item.qty_ordered for item in items):
        return PurchaseOrderStatus.RECEIVED
    if any(item.qty_received > 0 for item in items):
        return PurchaseOrderStatus.PARTIAL
    return PurchaseOrderStatus.OPEN


async def receive_order(
    session: AsyncSession,
    order_id: int,
    payload: PurchaseReceiveIn,
    user_id: int | None,
) -> PurchaseOrder:
    """Receive some or all outstanding lines; each becomes a RECEIPT stock move."""
    order = await get_order(session, order_id, lock=True)
    if order.status not in OPEN_STATUSES:
        raise ConflictError(f"purchase order is {order.status.value.lower()}")
    items = {item.sku_id: item for item in await get_items(session, order_id)}

    # Check every line before moving any stock: a delivery is all or nothing.
    for line in payload.items:
        item = items.get(line.sku_id)
        if item is None:
            raise ValidationError(f"sku {line.sku_id} is not on this purchase order")
        outstanding = item.qty_ordered - item.qty_received
        if line.qty > outstanding:
            raise ConflictError(
                f"sku {line.sku_id}: {line.qty} received, "
                f"only {outstanding} outstanding"
            )

    location_id = payload.location_id or order.location_id
    for line in payload.items:
        item = items[line.sku_id]
        await apply_move(
            session=session,
            branch_id=order.branch_id,
            sku_id=line.sku_id,
            qty_delta=line.qty,
            move_type=MoveType.RECEIPT,
            reason=f"PURCHASE_ORDER #{order.id}",
            location_id=location_id,
            created_by=user_id,
            unit_cost=item.unit_cost,
            lot=LotSpec(code=line.lot_code, expires_on=line.expires_on),
            supplier_id=order.supplier_id,
            purchase_order_id=order.id,
        )
        item.qty_received += line.qty

    order.status = _status_of(list(items.values()))
    await session.flush()
    return order


async def cancel_order(session: AsyncSession, order_id: int) -> PurchaseOrder:
    """Stop waiting for what is still outstanding; what already arrived stays."""
    order = await get_order(session, order_id, lock=True)
    if order.status not in OPEN_STATUSES:
        raise ConflictError(f"purchase order is {order.status.value.lower()}")
    order.status = PurchaseOrderStatus.CANCELLED
    await session.flush()
    return order
