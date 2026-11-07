"""Reports over the sales ledger. Best sellers for issue #34."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.domain.sales import branch_tz, day_bounds
from app.models.entities import DailyClose, Product, Sale, SaleItem, User
from app.schemas.base import SchemaBase
from app.services.audit_service import write_audit_log
from app.services.best_sellers import ranking_stmt

router = APIRouter(prefix="/reports/sales", tags=["reports"])


@router.get(
    "/best-sellers",
    dependencies=[Depends(require_permission("reports.read", branch_scoped=True))],
)
async def best_sellers(
    branch_id: int | None = Query(default=None),
    days: int = Query(30, ge=1, le=366),
    limit: int = Query(10, ge=1, le=100),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Units sold per product in the last `days` days, best first (voided excluded)."""
    since = datetime.now(UTC) - timedelta(days=days)
    stmt = ranking_stmt(since)
    allowed = scope.apply(select(Sale.id), Sale.branch_id, branch_id)
    stmt = stmt.where(Sale.id.in_(allowed.scalar_subquery())).limit(limit)
    rows = (await session.execute(stmt)).all()
    found = await session.execute(
        select(Product.id, Product.name).where(
            Product.id.in_([r.product_id for r in rows])
        )
    )
    names = {pid: name for pid, name in found.all()}
    return {
        "days": days,
        "branch_id": branch_id,
        "items": [
            {
                "rank": i,
                "product_id": r.product_id,
                "name": names.get(r.product_id),
                "qty": int(r.qty),
            }
            for i, r in enumerate(rows, start=1)
        ],
    }


async def day_summary(session: AsyncSession, branch_id: int, day: date) -> dict:
    """What the branch sold on a local calendar day, completed vs voided."""
    start, end = day_bounds(day, await branch_tz(session, branch_id))
    in_day = (Sale.branch_id == branch_id, Sale.sold_at >= start, Sale.sold_at < end)
    rows = await session.execute(
        select(Sale.status, func.count(), func.coalesce(func.sum(Sale.total), 0))
        .where(*in_day)
        .group_by(Sale.status)
    )
    by_status = {st: (int(n), total) for st, n, total in rows}
    done_n, done_total = by_status.get("COMPLETED", (0, 0))
    void_n, void_total = by_status.get("VOIDED", (0, 0))
    units = await session.scalar(
        select(func.coalesce(func.sum(SaleItem.qty), 0))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(*in_day, Sale.status == "COMPLETED")
    )
    return {
        "branch_id": branch_id,
        "day": day.isoformat(),
        "sales_count": done_n,
        "revenue": f"{Decimal(done_total):.2f}",
        "units_sold": int(units or 0),
        "voided_count": void_n,
        "voided_total": f"{Decimal(void_total):.2f}",
    }


@router.get(
    "/daily-close",
    dependencies=[Depends(require_permission("reports.read", branch_scoped=True))],
)
async def daily_close_report(
    branch_id: int = Query(...),
    day: date = Query(...),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """The day's summary (live) and whether the day was already closed."""
    scope.require(branch_id)
    closed = await session.scalar(
        select(DailyClose).where(
            DailyClose.branch_id == branch_id, DailyClose.day == day
        )
    )
    return {
        **await day_summary(session, branch_id, day),
        "closed": closed is not None,
        "closed_at": closed.closed_at.isoformat() if closed else None,
    }


class CloseIn(SchemaBase):
    branch_id: int
    day: date


@router.post(
    "/daily-close",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sales.day.close", branch_scoped=True))],
)
async def close_day(
    payload: CloseIn,
    request: Request,
    user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Close a day: sales and voids dated in it now need an audited override."""
    scope.require(payload.branch_id)
    tz = await branch_tz(session, payload.branch_id)
    if payload.day > datetime.now(tz).date():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "day is in the future"
        )
    existing = await session.scalar(
        select(DailyClose.id).where(
            DailyClose.branch_id == payload.branch_id, DailyClose.day == payload.day
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "day is already closed")
    summary = await day_summary(session, payload.branch_id, payload.day)
    session.add(
        DailyClose(
            branch_id=payload.branch_id,
            day=payload.day,
            closed_by=user.id if user else None,
            summary=summary,
        )
    )
    await write_audit_log(
        session,
        request=request,
        user_id=user.id if user else None,
        action="sales.day.close",
        resource_type="daily_close",
        resource_id=f"{payload.branch_id}:{payload.day}",
        after=summary,
        branch_id=payload.branch_id,
    )
    await session.commit()
    return {**summary, "closed": True}
