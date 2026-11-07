"""Reports over the sales ledger. Best sellers for issue #34."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.models.entities import Product, Sale
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
