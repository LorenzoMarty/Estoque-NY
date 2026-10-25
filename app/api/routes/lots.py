from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, page_meta
from app.domain.lots import fefo_order, fefo_plan, today_local
from app.models.entities import SKU, Lot
from app.schemas.base import SchemaBase

router = APIRouter(prefix="/stock", tags=["stock"])


class LotOut(SchemaBase):
    id: int
    branch_id: int
    sku_id: int
    sku_code: str
    code: str
    expires_on: date | None
    on_hand: int
    days_to_expiry: int | None


class FefoStepOut(SchemaBase):
    lot_id: int
    code: str
    expires_on: date | None
    qty: int


class FefoPlanOut(SchemaBase):
    branch_id: int
    sku_id: int
    requested: int
    from_lots: int
    untracked: int
    steps: list[FefoStepOut]


def _lot_out(lot: Lot, sku_code: str, today: date) -> LotOut:
    days = (lot.expires_on - today).days if lot.expires_on else None
    return LotOut(
        id=lot.id,
        branch_id=lot.branch_id,
        sku_id=lot.sku_id,
        sku_code=sku_code,
        code=lot.code,
        expires_on=lot.expires_on,
        on_hand=lot.on_hand,
        days_to_expiry=days,
    )


@router.get(
    "/lots",
    dependencies=[
        Depends(require_permission("stock.balance.read", branch_scoped=True))
    ],
)
async def list_lots(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    expiring_within_days: int | None = Query(default=None, ge=0, le=3650),
    include_empty: bool = Query(default=False),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Lots, first-expiring first. Empty lots are hidden unless asked for."""
    today = today_local()
    stmt = scope.apply(
        select(Lot, SKU.sku_code).join(SKU, SKU.id == Lot.sku_id),
        Lot.branch_id,
        branch_id,
    )
    if sku_id is not None:
        stmt = stmt.where(Lot.sku_id == sku_id)
    if not include_empty:
        stmt = stmt.where(Lot.on_hand > 0)
    if expiring_within_days is not None:
        stmt = stmt.where(
            Lot.expires_on <= today + timedelta(days=expiring_within_days)
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = await session.execute(
        stmt.order_by(*fefo_order()).limit(page_size).offset((page - 1) * page_size)
    )
    return {
        "items": [_lot_out(lot, code, today).model_dump() for lot, code in rows],
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/lots/fefo",
    response_model=FefoPlanOut,
    dependencies=[
        Depends(require_permission("stock.balance.read", branch_scoped=True))
    ],
)
async def fefo_suggestion(
    branch_id: int = Query(...),
    sku_id: int = Query(...),
    qty: int = Query(..., gt=0),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> FefoPlanOut:
    """Which lots an issue of `qty` would take from (nothing is changed)."""
    scope.require(branch_id)
    plan = await fefo_plan(session, branch_id, sku_id, qty)
    from_lots = sum(-step.qty for step in plan)
    return FefoPlanOut(
        branch_id=branch_id,
        sku_id=sku_id,
        requested=qty,
        from_lots=from_lots,
        untracked=qty - from_lots,
        steps=[
            FefoStepOut(
                lot_id=s.lot_id, code=s.code, expires_on=s.expires_on, qty=-s.qty
            )
            for s in plan
        ],
    )
