from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.domain.stock_engine import apply_move
from app.models.entities import SKU, StockBalance, StockMove, User
from app.models.enums import MoveType
from app.schemas.stock import (
    StockAdjustmentIn,
    StockBalanceOut,
    StockIssueIn,
    StockMoveOut,
    StockReceiptIn,
)
from app.services.audit_service import write_audit_log
from app.services.idempotency_service import (
    abort_idempotency,
    begin_idempotency,
    finish_idempotency,
)

router = APIRouter(prefix="/stock", tags=["stock"])


def build_move_out(move: StockMove, balance_after: int) -> StockMoveOut:
    return StockMoveOut(
        id=move.id,
        branch_id=move.branch_id,
        sku_id=move.sku_id,
        location_id=move.location_id,
        transfer_id=move.transfer_id,
        inventory_count_id=move.inventory_count_id,
        created_by=move.created_by,
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
    dependencies=[Depends(require_permission("stock.receipt.create"))],
)
async def create_receipt(
    payload: StockReceiptIn,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, payload.model_dump(mode="json"))
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

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
            created_by=current_user.id if current_user else None,
        )
        result = build_move_out(move, balance.on_hand)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.receipt.create",
            resource_type="stock_move",
            resource_id=move.id,
            before=None,
            after=result.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_201_CREATED,
        response_body=result.model_dump(mode="json"),
    )
    response.status_code = status.HTTP_201_CREATED
    return result


@router.post(
    "/issues",
    response_model=StockMoveOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("stock.issue.create"))],
)
async def create_issue(
    payload: StockIssueIn,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, payload.model_dump(mode="json"))
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

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
            created_by=current_user.id if current_user else None,
        )
        result = build_move_out(move, balance.on_hand)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.issue.create",
            resource_type="stock_move",
            resource_id=move.id,
            before=None,
            after=result.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_201_CREATED,
        response_body=result.model_dump(mode="json"),
    )
    response.status_code = status.HTTP_201_CREATED
    return result


@router.post(
    "/adjustments",
    response_model=StockMoveOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("stock.adjustment.create"))],
)
async def create_adjustment(
    payload: StockAdjustmentIn,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, payload.model_dump(mode="json"))
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

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
            created_by=current_user.id if current_user else None,
        )
        result = build_move_out(move, balance.on_hand)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.adjustment.create",
            resource_type="stock_move",
            resource_id=move.id,
            before=None,
            after=result.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_201_CREATED,
        response_body=result.model_dump(mode="json"),
    )
    response.status_code = status.HTTP_201_CREATED
    return result


@router.get(
    "/balances",
    response_model=list[StockBalanceOut],
    dependencies=[Depends(require_permission("stock.balance.read"))],
)
async def list_balances(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    product_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("updated_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
) -> list[StockBalance]:
    stmt = select(StockBalance).join(SKU, SKU.id == StockBalance.sku_id)
    if branch_id is not None:
        stmt = stmt.where(StockBalance.branch_id == branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockBalance.sku_id == sku_id)
    if product_id is not None:
        stmt = stmt.where(SKU.product_id == product_id)
    if location_id is not None:
        stmt = stmt.where(StockBalance.location_id == location_id)
    if q:
        stmt = stmt.where(
            or_(
                SKU.sku_code.ilike(f"%{q}%"),
                SKU.name.ilike(f"%{q}%"),
            )
        )

    if sort not in {
        "id",
        "updated_at",
        "on_hand",
        "branch_id",
        "sku_id",
        "location_id",
    }:
        sort = "updated_at"
    column = getattr(StockBalance, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    rows = await session.scalars(stmt)
    return list(rows.all())


@router.get(
    "/moves",
    response_model=list[StockMoveOut],
    dependencies=[Depends(require_permission("stock.move.read"))],
)
async def list_moves(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    product_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    type: MoveType | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("occurred_at"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int | None = Query(default=None, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[StockMoveOut]:
    running_balance = func.sum(StockMove.qty).over(
        partition_by=(StockMove.branch_id, StockMove.location_id, StockMove.sku_id),
        order_by=(StockMove.occurred_at, StockMove.id),
    )
    stmt = select(StockMove, running_balance.label("balance_after")).join(
        SKU, SKU.id == StockMove.sku_id
    )

    if branch_id is not None:
        stmt = stmt.where(StockMove.branch_id == branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockMove.sku_id == sku_id)
    if product_id is not None:
        stmt = stmt.where(SKU.product_id == product_id)
    if location_id is not None:
        stmt = stmt.where(StockMove.location_id == location_id)
    if from_date is not None:
        stmt = stmt.where(StockMove.occurred_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(StockMove.occurred_at <= to_date)
    if type is not None:
        stmt = stmt.where(StockMove.move_type == type)
    if q:
        stmt = stmt.where(
            or_(
                SKU.sku_code.ilike(f"%{q}%"),
                SKU.name.ilike(f"%{q}%"),
                StockMove.reason.ilike(f"%{q}%"),
                StockMove.reference_id.ilike(f"%{q}%"),
            )
        )

    move_sort_fields = {
        "id": StockMove.id,
        "occurred_at": StockMove.occurred_at,
        "created_at": StockMove.created_at,
        "qty": StockMove.qty,
        "move_type": StockMove.move_type,
    }
    sort_column = move_sort_fields.get(sort, StockMove.occurred_at)
    stmt = stmt.order_by(sort_column.asc() if order == "asc" else sort_column.desc())

    if limit is not None:
        stmt = stmt.limit(limit).offset(offset or 0)
    else:
        stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    rows = (await session.execute(stmt)).all()
    result: list[StockMoveOut] = []
    for row in rows:
        move = row.StockMove
        if move is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="invalid move row",
            )
        result.append(build_move_out(move, int(row.balance_after)))
    return result
