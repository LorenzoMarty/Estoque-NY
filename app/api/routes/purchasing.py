from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import (
    PaginationParams,
    apply_order_and_pagination,
    page_meta,
    pagination_params,
)
from app.api.security import get_current_user, require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.domain import purchasing
from app.domain.errors import DomainError, NotFoundError
from app.models.entities import PurchaseOrder, Supplier, User
from app.models.enums import PurchaseOrderStatus
from app.schemas.purchasing import (
    PurchaseOrderCreate,
    PurchaseOrderItemOut,
    PurchaseOrderListOut,
    PurchaseOrderOut,
    PurchaseReceiveIn,
    SupplierCreate,
    SupplierListOut,
    SupplierOut,
    SupplierUpdate,
)
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/stock", tags=["purchasing"])


# --- suppliers ---------------------------------------------------------------------


async def _supplier(session: AsyncSession, supplier_id: int) -> Supplier:
    supplier = await session.get(Supplier, supplier_id)
    if supplier is None:
        raise domain_error_to_http(NotFoundError(f"supplier {supplier_id} not found"))
    return supplier


@router.post(
    "/suppliers",
    response_model=SupplierOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("stock.supplier.create"))],
)
async def create_supplier(
    payload: SupplierCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SupplierOut:
    supplier = Supplier(**payload.model_dump())
    session.add(supplier)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="supplier name already exists"
        ) from exc
    out = SupplierOut.model_validate(supplier)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="supplier.create",
        resource_type="supplier",
        resource_id=supplier.id,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    return out


@router.get(
    "/suppliers",
    response_model=SupplierListOut,
    dependencies=[Depends(require_permission("stock.supplier.read"))],
)
async def list_suppliers(
    active: bool | None = Query(default=None),
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> SupplierListOut:
    stmt = select(Supplier)
    if active is not None:
        stmt = stmt.where(Supplier.active == active)
    if params.q:
        stmt = stmt.where(Supplier.name.ilike(f"%{params.q}%"))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=Supplier,
        params=params,
        allowed_sort_fields={"id", "name", "created_at"},
        default_sort="name",
    )
    rows = (await session.scalars(stmt)).all()
    return SupplierListOut(
        items=[SupplierOut.model_validate(r) for r in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/suppliers/{supplier_id}",
    response_model=SupplierOut,
    dependencies=[Depends(require_permission("stock.supplier.read"))],
)
async def get_supplier(
    supplier_id: int, session: AsyncSession = Depends(get_session)
) -> SupplierOut:
    return SupplierOut.model_validate(await _supplier(session, supplier_id))


@router.put(
    "/suppliers/{supplier_id}",
    response_model=SupplierOut,
    dependencies=[Depends(require_permission("stock.supplier.update"))],
)
async def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SupplierOut:
    supplier = await _supplier(session, supplier_id)
    before = SupplierOut.model_validate(supplier).model_dump(mode="json")
    # Only what the client sent changes: a name-only edit keeps phone, e-mail, etc.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="supplier name already exists"
        ) from exc
    out = SupplierOut.model_validate(supplier)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="supplier.update",
        resource_type="supplier",
        resource_id=supplier.id,
        before=before,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    return out


@router.delete(
    "/suppliers/{supplier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("stock.supplier.delete"))],
)
async def delete_supplier(
    supplier_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    supplier = await _supplier(session, supplier_id)
    has_orders = await session.scalar(
        select(exists().where(PurchaseOrder.supplier_id == supplier_id))
    )
    if has_orders:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="supplier has purchase orders; deactivate it instead",
        )
    before = SupplierOut.model_validate(supplier).model_dump(mode="json")
    await session.delete(supplier)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="supplier.delete",
        resource_type="supplier",
        resource_id=supplier_id,
        before=before,
    )
    await session.commit()


# --- purchase orders ---------------------------------------------------------------


async def _order_out(session: AsyncSession, order: PurchaseOrder) -> PurchaseOrderOut:
    items = await purchasing.get_items(session, order.id)
    return PurchaseOrderOut(
        id=order.id,
        supplier_id=order.supplier_id,
        branch_id=order.branch_id,
        location_id=order.location_id,
        status=order.status,
        reference=order.reference,
        expected_on=order.expected_on,
        created_at=order.created_at,
        items=[
            PurchaseOrderItemOut(
                id=i.id,
                sku_id=i.sku_id,
                qty_ordered=i.qty_ordered,
                qty_received=i.qty_received,
                qty_outstanding=i.qty_ordered - i.qty_received,
                unit_cost=i.unit_cost,
            )
            for i in items
        ],
    )


@router.post(
    "/purchase-orders",
    response_model=PurchaseOrderOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission("stock.purchase.create", branch_scoped=True))
    ],
)
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> PurchaseOrderOut:
    scope.require(payload.branch_id)
    try:
        order = await purchasing.create_order(
            session, payload, current_user.id if current_user else None
        )
        out = await _order_out(session, order)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="purchase_order.create",
            resource_type="purchase_order",
            resource_id=order.id,
            after=out.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    return out


@router.get(
    "/purchase-orders",
    response_model=PurchaseOrderListOut,
    dependencies=[
        Depends(require_permission("stock.purchase.read", branch_scoped=True))
    ],
)
async def list_purchase_orders(
    branch_id: int | None = Query(default=None),
    supplier_id: int | None = Query(default=None),
    order_status: PurchaseOrderStatus | None = Query(default=None, alias="status"),
    params: PaginationParams = Depends(pagination_params),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> PurchaseOrderListOut:
    stmt = scope.apply(select(PurchaseOrder), PurchaseOrder.branch_id, branch_id)
    if supplier_id is not None:
        stmt = stmt.where(PurchaseOrder.supplier_id == supplier_id)
    if order_status is not None:
        stmt = stmt.where(PurchaseOrder.status == order_status)
    if params.q:
        stmt = stmt.where(PurchaseOrder.reference.ilike(f"%{params.q}%"))
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=PurchaseOrder,
        params=params,
        allowed_sort_fields={"id", "created_at", "expected_on"},
        default_sort="id",
    )
    orders = (await session.scalars(stmt)).all()
    return PurchaseOrderListOut(
        items=[await _order_out(session, o) for o in orders],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/purchase-orders/{order_id}",
    response_model=PurchaseOrderOut,
    dependencies=[
        Depends(require_permission("stock.purchase.read", branch_scoped=True))
    ],
)
async def get_purchase_order(
    order_id: int,
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> PurchaseOrderOut:
    try:
        order = await purchasing.get_order(session, order_id)
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    scope.require(order.branch_id)
    return await _order_out(session, order)


async def _change(
    action: str,
    order_id: int,
    request: Request,
    current_user: User | None,
    scope: BranchScope,
    session: AsyncSession,
    operation,
) -> PurchaseOrderOut:
    """Load, check branch access, run `operation`, audit and commit."""
    try:
        existing = await purchasing.get_order(session, order_id)
        scope.require(existing.branch_id)
        before = await _order_out(session, existing)
        order = await operation()
        out = await _order_out(session, order)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action=f"purchase_order.{action}",
            resource_type="purchase_order",
            resource_id=order.id,
            before=before.model_dump(mode="json"),
            after=out.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise
    return out


@router.post(
    "/purchase-orders/{order_id}/receive",
    response_model=PurchaseOrderOut,
    dependencies=[
        Depends(require_permission("stock.purchase.receive", branch_scoped=True))
    ],
)
async def receive_purchase_order(
    order_id: int,
    payload: PurchaseReceiveIn,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> PurchaseOrderOut:
    """Receive part or all of the outstanding lines; each becomes a receipt move."""
    user_id = current_user.id if current_user else None
    return await _change(
        "receive",
        order_id,
        request,
        current_user,
        scope,
        session,
        lambda: purchasing.receive_order(session, order_id, payload, user_id),
    )


@router.post(
    "/purchase-orders/{order_id}/cancel",
    response_model=PurchaseOrderOut,
    dependencies=[
        Depends(require_permission("stock.purchase.cancel", branch_scoped=True))
    ],
)
async def cancel_purchase_order(
    order_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> PurchaseOrderOut:
    """Stop waiting for what is outstanding; what already arrived stays in stock."""
    return await _change(
        "cancel",
        order_id,
        request,
        current_user,
        scope,
        session,
        lambda: purchasing.cancel_order(session, order_id),
    )
