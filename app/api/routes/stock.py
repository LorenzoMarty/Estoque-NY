from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.core.db import get_session
from app.domain.errors import DomainError
from app.domain.stock_engine import apply_move
from app.models.entities import StockBalance, StockMove
from app.models.enums import MoveType
from app.schemas.stock import (
    StockAdjustmentIn,
    StockBalanceOut,
    StockIssueIn,
    StockMoveOut,
    StockReceiptIn,
)

router = APIRouter(prefix="/stock", tags=["stock"])


def build_move_out(move: StockMove, balance_after: int) -> StockMoveOut:
    return StockMoveOut(
        id=move.id,
        branch_id=move.branch_id,
        sku_id=move.sku_id,
        location_id=move.location_id,
        move_type=move.move_type,
        qty=move.qty,
        occurred_at=move.occurred_at,
        created_at=move.created_at,
        reason=move.reason,
        reference_id=move.reference_id,
        balance_after=balance_after,
    )


@router.post(
    "/receipts",
    response_model=StockMoveOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_receipt(
    payload: StockReceiptIn,
    session: AsyncSession = Depends(get_session),
) -> StockMoveOut:
    try:
        move, balance = await apply_move(
            session=session,
            branch_id=payload.branch_id,
            sku_id=payload.sku_id,
            qty_delta=payload.qty,
            move_type=MoveType.RECEIPT,
            reason=payload.reason,
            reference_id=payload.reference_id,
            occurred_at=payload.occurred_at,
            location_id=payload.location_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return build_move_out(move, balance.on_hand)


@router.post(
    "/issues",
    response_model=StockMoveOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_issue(
    payload: StockIssueIn,
    session: AsyncSession = Depends(get_session),
) -> StockMoveOut:
    try:
        move, balance = await apply_move(
            session=session,
            branch_id=payload.branch_id,
            sku_id=payload.sku_id,
            qty_delta=-payload.qty,
            move_type=MoveType.ISSUE,
            reason=payload.reason,
            reference_id=payload.reference_id,
            occurred_at=payload.occurred_at,
            location_id=payload.location_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return build_move_out(move, balance.on_hand)


@router.post(
    "/adjustments",
    response_model=StockMoveOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_adjustment(
    payload: StockAdjustmentIn,
    session: AsyncSession = Depends(get_session),
) -> StockMoveOut:
    try:
        move, balance = await apply_move(
            session=session,
            branch_id=payload.branch_id,
            sku_id=payload.sku_id,
            qty_delta=payload.qty_delta,
            move_type=MoveType.ADJUSTMENT,
            reason=payload.reason,
            reference_id=payload.reference_id,
            occurred_at=payload.occurred_at,
            location_id=payload.location_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return build_move_out(move, balance.on_hand)


@router.get("/balances", response_model=list[StockBalanceOut])
async def list_balances(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[StockBalance]:
    stmt = select(StockBalance).order_by(StockBalance.id)
    if branch_id is not None:
        stmt = stmt.where(StockBalance.branch_id == branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockBalance.sku_id == sku_id)

    result = await session.scalars(stmt)
    return list(result.all())


@router.get("/moves", response_model=list[StockMoveOut])
async def list_moves(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[StockMoveOut]:
    running_balance = func.sum(StockMove.qty).over(
        partition_by=(StockMove.branch_id, StockMove.sku_id),
        order_by=(StockMove.occurred_at, StockMove.id),
    )

    stmt = select(StockMove, running_balance.label("balance_after"))
    if branch_id is not None:
        stmt = stmt.where(StockMove.branch_id == branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockMove.sku_id == sku_id)

    stmt = (
        stmt.order_by(StockMove.occurred_at, StockMove.id).limit(limit).offset(offset)
    )

    rows = (await session.execute(stmt)).all()
    moves: list[StockMoveOut] = []
    for row in rows:
        move = row.StockMove
        if move is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="invalid stock move row",
            )

        balance_after = row.balance_after
        moves.append(build_move_out(move, int(balance_after)))

    return moves
