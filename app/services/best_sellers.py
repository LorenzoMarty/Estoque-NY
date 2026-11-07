"""Best-seller ranking from the sales ledger (issue #34).

Ranked by units sold per product over a rolling window; voided sales do not count.
Ties break by product id so the order is stable. The public catalog flags the top
`PUBLIC_TOP_N` of the last `PUBLIC_WINDOW_DAYS` days across all branches.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import SKU, Sale, SaleItem

PUBLIC_WINDOW_DAYS = 30
PUBLIC_TOP_N = 10


def ranking_stmt(
    since: datetime, until: datetime | None = None, limit: int | None = None
) -> Select:
    qty = func.sum(SaleItem.qty).label("qty")
    stmt = (
        select(SKU.product_id, qty)
        .join(SaleItem, SaleItem.sku_id == SKU.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.status == "COMPLETED", Sale.sold_at >= since)
        .group_by(SKU.product_id)
        .order_by(desc(qty), SKU.product_id)
    )
    if until is not None:
        stmt = stmt.where(Sale.sold_at < until)
    return stmt.limit(limit) if limit else stmt


async def public_best_seller_ids(session: AsyncSession) -> set[int]:
    since = datetime.now(UTC) - timedelta(days=PUBLIC_WINDOW_DAYS)
    rows = await session.execute(ranking_stmt(since, limit=PUBLIC_TOP_N))
    return {product_id for product_id, _ in rows}
