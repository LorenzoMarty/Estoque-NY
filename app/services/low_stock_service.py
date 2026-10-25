"""Low-stock detection and the daily alert (issue #20)."""

import logging
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_sessionmaker
from app.core.notify import send_email
from app.models.entities import SKU, StockBalance, StockThreshold

logger = logging.getLogger("app.low_stock")

# Branches operate in this time zone; "one alert per day" follows its calendar.
LOCAL_TZ = ZoneInfo("America/Sao_Paulo")


@dataclass
class LowStockRow:
    threshold_id: int
    branch_id: int
    sku_id: int
    sku_code: str
    name: str | None
    on_hand: int
    min_qty: int
    max_qty: int | None

    @property
    def missing(self) -> int:
        return self.min_qty - self.on_hand


def low_stock_select() -> Select:
    """Thresholds whose branch total (all locations) is below the minimum."""
    totals = (
        select(
            StockBalance.branch_id,
            StockBalance.sku_id,
            func.sum(StockBalance.on_hand).label("total"),
        )
        .group_by(StockBalance.branch_id, StockBalance.sku_id)
        .subquery()
    )
    on_hand = func.coalesce(totals.c.total, 0)
    return (
        select(
            StockThreshold.id.label("threshold_id"),
            StockThreshold.branch_id,
            StockThreshold.sku_id,
            SKU.sku_code,
            SKU.name,
            on_hand.label("on_hand"),
            StockThreshold.min_qty,
            StockThreshold.max_qty,
        )
        .join(SKU, SKU.id == StockThreshold.sku_id)
        .join(
            totals,
            (totals.c.branch_id == StockThreshold.branch_id)
            & (totals.c.sku_id == StockThreshold.sku_id),
            isouter=True,
        )
        .where(
            StockThreshold.min_qty > 0,
            on_hand < StockThreshold.min_qty,
            SKU.active.is_(True),
            SKU.archived_at.is_(None),
        )
    )


def to_row(r) -> LowStockRow:
    return LowStockRow(
        threshold_id=r.threshold_id,
        branch_id=r.branch_id,
        sku_id=r.sku_id,
        sku_code=r.sku_code,
        name=r.name,
        on_hand=int(r.on_hand),
        min_qty=r.min_qty,
        max_qty=r.max_qty,
    )


def _message(rows: list[LowStockRow]) -> str:
    lines = [f"{len(rows)} item(ns) abaixo do estoque mínimo:", ""]
    lines += [
        f"- filial {r.branch_id} · {r.sku_code} {r.name or ''}: "
        f"{r.on_hand} em estoque, mínimo {r.min_qty} (faltam {r.missing})"
        for r in rows
    ]
    return "\n".join(lines)


async def send_low_stock_alert(today: date | None = None) -> int:
    """Alert on SKUs below minimum that were not alerted today; return how many.

    The alert goes by e-mail when SMTP is configured, and always to the log.
    """
    today = today or datetime.now(LOCAL_TZ).date()
    async with get_sessionmaker()() as session:
        result = await session.execute(
            low_stock_select()
            .where(
                or_(
                    StockThreshold.last_alert_on.is_(None),
                    StockThreshold.last_alert_on != today,
                )
            )
            .order_by(StockThreshold.branch_id, SKU.sku_code)
        )
        rows = [to_row(r) for r in result]
        if not rows:
            return 0
        body = _message(rows)
        logger.warning("low stock alert\n%s", body)
        await send_email(f"Estoque baixo: {len(rows)} item(ns)", body)
        await _mark_alerted(session, [r.threshold_id for r in rows], today)
        return len(rows)


async def _mark_alerted(
    session: AsyncSession, threshold_ids: list[int], today: date
) -> None:
    for threshold in await session.scalars(
        select(StockThreshold).where(StockThreshold.id.in_(threshold_ids))
    ):
        threshold.last_alert_on = today
    await session.commit()
