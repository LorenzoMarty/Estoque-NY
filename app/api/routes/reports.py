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
from app.models.entities import (
    SKU,
    Campaign,
    CampaignProduct,
    Product,
    Promotion,
    PromotionSKU,
    StockBalance,
    StockMove,
)
from app.models.enums import CampaignStatus, MoveType, PromotionStatus
from app.schemas.report import (
    CampaignProductRow,
    CampaignRow,
    LowTurnoverCandidateRow,
    MarketingDashboardSummary,
    PromotionSKURow,
    StockABCRow,
    StockTurnoverRow,
    StockValuationRow,
    TopSKUByValueRow,
)

router = APIRouter(prefix="/reports/stock", tags=["reports"])
marketing_router = APIRouter(prefix="/reports/marketing", tags=["reports"])

DEFAULT_LOW_TURNOVER_THRESHOLD = 0.5


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


async def _low_turnover_rows(
    session: AsyncSession,
    *,
    branch_id: int | None,
    location_id: int | None,
    from_date: datetime | None,
    to_date: datetime | None,
    threshold: float,
) -> list[LowTurnoverCandidateRow]:
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

    rows = (await session.execute(stmt)).all()
    candidates: list[LowTurnoverCandidateRow] = []
    for row in rows:
        average_stock = float(row.average_stock or 0)
        issued_qty = float(row.issued_qty or 0)
        if average_stock > 0:
            turnover = issued_qty / average_stock
        else:
            turnover = issued_qty
        if turnover <= threshold:
            candidates.append(
                LowTurnoverCandidateRow(
                    branch_id=row.branch_id,
                    location_id=row.location_id,
                    sku_id=row.sku_id,
                    issued_qty=int(row.issued_qty or 0),
                    average_stock=average_stock,
                    turnover=turnover,
                )
            )
    return candidates


async def _top_skus_by_value(
    session: AsyncSession, *, limit: int = 5
) -> list[TopSKUByValueRow]:
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
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        TopSKUByValueRow(
            sku_id=row.sku_id, movement_value=Decimal(str(row.movement_value or 0))
        )
        for row in rows
    ]


@marketing_router.get(
    "/campaign-products",
    dependencies=[Depends(require_permission("reports.marketing.read"))],
)
async def campaign_products_report(
    campaign_id: int | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    on_hand_expr = func.coalesce(func.sum(StockBalance.on_hand), 0).label("on_hand")
    stock_balance_join_condition = StockBalance.sku_id == SKU.id
    if branch_id is not None:
        stock_balance_join_condition = stock_balance_join_condition & (
            StockBalance.branch_id == branch_id
        )
    stmt = (
        select(
            CampaignProduct.campaign_id,
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            on_hand_expr,
        )
        .join(Product, Product.id == CampaignProduct.product_id)
        .join(SKU, SKU.product_id == Product.id, isouter=True)
        .join(StockBalance, stock_balance_join_condition, isouter=True)
        .group_by(CampaignProduct.campaign_id, Product.id, Product.name)
    )
    if campaign_id is not None:
        stmt = stmt.where(CampaignProduct.campaign_id == campaign_id)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(desc("on_hand")).limit(page_size).offset((page - 1) * page_size)
    )
    rows = (await session.execute(stmt)).all()
    items = [
        CampaignProductRow(
            campaign_id=row.campaign_id,
            product_id=row.product_id,
            product_name=row.product_name,
            on_hand=int(row.on_hand or 0),
        ).model_dump(mode="json")
        for row in rows
    ]
    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@marketing_router.get(
    "/promotion-skus",
    dependencies=[Depends(require_permission("reports.marketing.read"))],
)
async def promotion_skus_report(
    promotion_id: int | None = Query(default=None),
    status: PromotionStatus | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = (
        select(
            PromotionSKU.promotion_id,
            SKU.id.label("sku_id"),
            SKU.sku_code,
            SKU.cost,
            SKU.price,
        )
        .join(SKU, SKU.id == PromotionSKU.sku_id)
        .join(Promotion, Promotion.id == PromotionSKU.promotion_id)
    )
    if promotion_id is not None:
        stmt = stmt.where(PromotionSKU.promotion_id == promotion_id)
    if status is not None:
        stmt = stmt.where(Promotion.status == status)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(SKU.sku_code).limit(page_size).offset((page - 1) * page_size)
    rows = (await session.execute(stmt)).all()
    items = [
        PromotionSKURow(
            promotion_id=row.promotion_id,
            sku_id=row.sku_id,
            sku_code=row.sku_code,
            cost=row.cost,
            price=row.price,
        ).model_dump(mode="json")
        for row in rows
    ]
    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@marketing_router.get(
    "/campaigns",
    dependencies=[Depends(require_permission("reports.marketing.read"))],
)
async def campaigns_report(
    channel_id: int | None = Query(default=None),
    status: CampaignStatus | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(Campaign)
    if channel_id is not None:
        stmt = stmt.where(Campaign.channel_id == channel_id)
    if status is not None:
        stmt = stmt.where(Campaign.status == status)
    if from_date is not None:
        stmt = stmt.where(
            (Campaign.ends_at.is_(None)) | (Campaign.ends_at >= from_date)
        )
    if to_date is not None:
        stmt = stmt.where(
            (Campaign.starts_at.is_(None)) | (Campaign.starts_at <= to_date)
        )

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = (
        stmt.order_by(desc(Campaign.starts_at))
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    campaigns = list((await session.scalars(stmt)).all())
    items = [
        CampaignRow(
            id=campaign.id,
            name=campaign.name,
            status=campaign.status.value,
            channel_id=campaign.channel_id,
            starts_at=campaign.starts_at,
            ends_at=campaign.ends_at,
            budget=campaign.budget,
        ).model_dump(mode="json")
        for campaign in campaigns
    ]
    return {
        "items": items,
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@marketing_router.get(
    "/low-turnover-candidates",
    dependencies=[Depends(require_permission("reports.marketing.read"))],
)
async def low_turnover_candidates_report(
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    threshold: float = Query(default=DEFAULT_LOW_TURNOVER_THRESHOLD, ge=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> dict:
    candidates = await _low_turnover_rows(
        session,
        branch_id=branch_id,
        location_id=location_id,
        from_date=from_date,
        to_date=to_date,
        threshold=threshold,
    )
    candidates.sort(key=lambda row: row.turnover)
    total = len(candidates)
    start = (page - 1) * page_size
    end = start + page_size
    items = [row.model_dump(mode="json") for row in candidates[start:end]]
    return {
        "items": items,
        "meta": page_meta(total=total, page=page, page_size=page_size),
    }


@marketing_router.get(
    "/dashboard-summary",
    dependencies=[Depends(require_permission("reports.marketing.read"))],
    response_model=MarketingDashboardSummary,
)
async def marketing_dashboard_summary(
    session: AsyncSession = Depends(get_session),
) -> MarketingDashboardSummary:
    valuation_total = (
        await session.scalar(
            select(func.coalesce(func.sum(StockBalance.on_hand * SKU.cost), 0)).join(
                SKU, SKU.id == StockBalance.sku_id
            )
        )
        or 0
    )
    active_campaigns_count = (
        await session.scalar(
            select(func.count())
            .select_from(Campaign)
            .where(Campaign.status == CampaignStatus.ACTIVE)
        )
        or 0
    )
    active_promotions_count = (
        await session.scalar(
            select(func.count())
            .select_from(Promotion)
            .where(Promotion.status == PromotionStatus.ACTIVE)
        )
        or 0
    )
    low_turnover_candidates = await _low_turnover_rows(
        session,
        branch_id=None,
        location_id=None,
        from_date=None,
        to_date=None,
        threshold=DEFAULT_LOW_TURNOVER_THRESHOLD,
    )
    top_skus = await _top_skus_by_value(session, limit=5)

    return MarketingDashboardSummary(
        stock_valuation_total=Decimal(str(valuation_total)),
        active_campaigns_count=int(active_campaigns_count),
        active_promotions_count=int(active_promotions_count),
        low_turnover_candidates_count=len(low_turnover_candidates),
        top_skus_by_value=top_skus,
    )
