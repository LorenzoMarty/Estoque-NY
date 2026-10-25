from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.security import get_current_user, require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, page_meta
from app.domain.errors import NotFoundError
from app.models.entities import SKU, Branch, StockThreshold, User
from app.schemas.base import SchemaBase
from app.services.audit_service import write_audit_log
from app.services.low_stock_service import low_stock_select, to_row

router = APIRouter(prefix="/stock", tags=["stock"])


class ThresholdIn(SchemaBase):
    branch_id: int
    sku_id: int
    # 0 turns the alert off for this SKU in this branch.
    min_qty: int = Field(ge=0)
    max_qty: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def max_not_below_min(self):
        if self.max_qty is not None and self.max_qty < self.min_qty:
            raise ValueError("max_qty cannot be below min_qty")
        return self


class ThresholdOut(SchemaBase):
    id: int
    branch_id: int
    sku_id: int
    min_qty: int
    max_qty: int | None


class LowStockOut(SchemaBase):
    threshold_id: int
    branch_id: int
    sku_id: int
    sku_code: str
    name: str | None
    on_hand: int
    min_qty: int
    max_qty: int | None
    missing: int


@router.put(
    "/thresholds",
    response_model=ThresholdOut,
    dependencies=[
        Depends(require_permission("stock.adjustment.create", branch_scoped=True))
    ],
)
async def upsert_threshold(
    payload: ThresholdIn,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> ThresholdOut:
    scope.require(payload.branch_id)
    try:
        if await session.get(Branch, payload.branch_id) is None:
            raise NotFoundError(f"branch {payload.branch_id} not found")
        if await session.get(SKU, payload.sku_id) is None:
            raise NotFoundError(f"sku {payload.sku_id} not found")
    except NotFoundError as exc:
        raise domain_error_to_http(exc) from exc

    threshold = await session.scalar(
        select(StockThreshold).where(
            StockThreshold.branch_id == payload.branch_id,
            StockThreshold.sku_id == payload.sku_id,
        )
    )
    before = ThresholdOut.model_validate(threshold).model_dump() if threshold else None
    if threshold is None:
        threshold = StockThreshold(branch_id=payload.branch_id, sku_id=payload.sku_id)
        session.add(threshold)
    threshold.min_qty = payload.min_qty
    threshold.max_qty = payload.max_qty
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="stock.threshold.set",
        resource_type="stock_threshold",
        resource_id=threshold.id,
        before=before,
        after=ThresholdOut.model_validate(threshold).model_dump(),
    )
    await session.commit()
    return ThresholdOut.model_validate(threshold)


@router.get(
    "/thresholds",
    dependencies=[
        Depends(require_permission("stock.balance.read", branch_scoped=True))
    ],
)
async def list_thresholds(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = scope.apply(select(StockThreshold), StockThreshold.branch_id, branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockThreshold.sku_id == sku_id)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await session.scalars(
        stmt.order_by(
            StockThreshold.branch_id, StockThreshold.sku_id, StockThreshold.id
        )
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    return {
        "items": [ThresholdOut.model_validate(r).model_dump() for r in rows],
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/low-stock",
    dependencies=[
        Depends(require_permission("stock.balance.read", branch_scoped=True))
    ],
)
async def low_stock(
    branch_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """SKUs whose branch total is below the configured minimum, biggest gap first."""
    inner = scope.apply(low_stock_select(), StockThreshold.branch_id, branch_id)
    sub = inner.subquery()
    total = await session.scalar(select(func.count()).select_from(sub)) or 0
    result = await session.execute(
        select(sub)
        .order_by((sub.c.min_qty - sub.c.on_hand).desc(), sub.c.threshold_id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = []
    for r in result:
        row = to_row(r)
        items.append(LowStockOut(**vars(row), missing=row.missing).model_dump())
    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }
