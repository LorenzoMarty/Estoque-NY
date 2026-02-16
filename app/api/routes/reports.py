import csv
from datetime import datetime
from decimal import Decimal
from io import StringIO

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.api.pagination import page_meta
from app.api.security import require_permission
from app.core.db import get_session
from app.models.entities import SKU, StockBalance, StockMove
from app.models.enums import MoveType
from app.schemas.report import StockABCRow, StockTurnoverRow, StockValuationRow

router = APIRouter(prefix="/reports/stock", tags=["reports"])


@router.get(
    "/valuation",
    dependencies=[Depends(require_permission("reports.read"))],
)
async def stock_valuation(
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    valuation_expr = (StockBalance.on_hand * SKU.cost).label("valuation")
    stmt = select(
        StockBalance.branch_id,
        StockBalance.location_id,
        StockBalance.sku_id,
        StockBalance.on_hand,
        SKU.cost,
        valuation_expr,
    ).join(SKU, SKU.id == StockBalance.sku_id)
    if branch_id is not None:
        stmt = stmt.where(StockBalance.branch_id == branch_id)
    if location_id is not None:
        stmt = stmt.where(StockBalance.location_id == location_id)
    if sku_id is not None:
        stmt = stmt.where(StockBalance.sku_id == sku_id)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(desc("valuation")).limit(page_size).offset((page - 1) * page_size)
    )
    rows = (await session.execute(stmt)).all()
    items = [
        StockValuationRow(
            branch_id=row.branch_id,
            location_id=row.location_id,
            sku_id=row.sku_id,
            on_hand=row.on_hand,
            cost=row.cost,
            valuation=row.valuation,
        ).model_dump(mode="json")
        for row in rows
    ]
    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/turnover",
    dependencies=[Depends(require_permission("reports.read"))],
)
async def stock_turnover(
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    issued_qty = func.sum(case((StockMove.qty < 0, -StockMove.qty), else_=0)).label(
        "issued_qty"
    )
    stmt = (
        select(
            StockMove.branch_id,
            StockMove.location_id,
            StockMove.sku_id,
            issued_qty,
            func.coalesce(func.max(StockBalance.on_hand), 0).label("average_stock"),
        )
        .join(
            StockBalance,
            (StockBalance.branch_id == StockMove.branch_id)
            & (StockBalance.sku_id == StockMove.sku_id)
            & (StockBalance.location_id == StockMove.location_id),
            isouter=True,
        )
        .where(StockMove.move_type == MoveType.ISSUE)
        .group_by(StockMove.branch_id, StockMove.location_id, StockMove.sku_id)
    )
    if branch_id is not None:
        stmt = stmt.where(StockMove.branch_id == branch_id)
    if location_id is not None:
        stmt = stmt.where(StockMove.location_id == location_id)
    if from_date is not None:
        stmt = stmt.where(StockMove.occurred_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(StockMove.occurred_at <= to_date)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(desc("issued_qty"))
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    rows = (await session.execute(stmt)).all()

    items = []
    for row in rows:
        average_stock = float(row.average_stock or 0)
        turnover = float(row.issued_qty) / average_stock if average_stock > 0 else 0.0
        items.append(
            StockTurnoverRow(
                branch_id=row.branch_id,
                location_id=row.location_id,
                sku_id=row.sku_id,
                issued_qty=int(row.issued_qty or 0),
                average_stock=average_stock,
                turnover=turnover,
            ).model_dump(mode="json")
        )

    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/movements",
    dependencies=[Depends(require_permission("reports.read"))],
    response_model=None,
)
async def stock_movements_report(
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    move_type: MoveType | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    export: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict | StreamingResponse:
    stmt = select(StockMove).join(SKU, SKU.id == StockMove.sku_id)
    if branch_id is not None:
        stmt = stmt.where(StockMove.branch_id == branch_id)
    if location_id is not None:
        stmt = stmt.where(StockMove.location_id == location_id)
    if sku_id is not None:
        stmt = stmt.where(StockMove.sku_id == sku_id)
    if move_type is not None:
        stmt = stmt.where(StockMove.move_type == move_type)
    if from_date is not None:
        stmt = stmt.where(StockMove.occurred_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(StockMove.occurred_at <= to_date)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(StockMove.occurred_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    moves = list((await session.scalars(stmt)).all())

    items = [
        {
            "id": move.id,
            "branch_id": move.branch_id,
            "location_id": move.location_id,
            "sku_id": move.sku_id,
            "move_type": move.move_type.value,
            "qty": move.qty,
            "occurred_at": move.occurred_at.isoformat(),
            "reason": move.reason,
            "reference_id": move.reference_id,
        }
        for move in moves
    ]

    if export and export.lower() == "csv":
        buffer = StringIO()
        writer = csv.DictWriter(
            buffer, fieldnames=list(items[0].keys()) if items else []
        )
        if items:
            writer.writeheader()
            writer.writerows(items)
        buffer.seek(0)
        return StreamingResponse(
            iter([buffer.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=stock_movements.csv"},
        )

    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/abc",
    dependencies=[Depends(require_permission("reports.read"))],
)
async def stock_abc_report(
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    movement_value = func.sum(
        case(
            (StockMove.qty < 0, (-StockMove.qty) * SKU.cost),
            else_=literal_column("0"),
        )
    ).label("movement_value")

    stmt = (
        select(StockMove.sku_id, movement_value)
        .join(SKU, SKU.id == StockMove.sku_id)
        .where(StockMove.move_type == MoveType.ISSUE)
        .group_by(StockMove.sku_id)
        .order_by(desc("movement_value"))
    )
    if branch_id is not None:
        stmt = stmt.where(StockMove.branch_id == branch_id)
    if location_id is not None:
        stmt = stmt.where(StockMove.location_id == location_id)
    if from_date is not None:
        stmt = stmt.where(StockMove.occurred_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(StockMove.occurred_at <= to_date)

    rows = (await session.execute(stmt)).all()
    total_value = sum(float(row.movement_value or 0) for row in rows)

    items: list[dict] = []
    cumulative = 0.0
    for row in rows:
        value = float(row.movement_value or 0)
        if total_value > 0:
            cumulative += value / total_value * 100
        class_name = "C"
        if cumulative <= 80:
            class_name = "A"
        elif cumulative <= 95:
            class_name = "B"

        items.append(
            StockABCRow(
                sku_id=row.sku_id,
                movement_value=Decimal(str(row.movement_value or 0)),
                cumulative_percent=round(cumulative, 2),
                class_name=class_name,
            ).model_dump(mode="json")
        )

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": items[start:end],
        "meta": page_meta(total=total, page=page, page_size=page_size),
    }
