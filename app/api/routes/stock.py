from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import (
    PaginationParams,
    apply_order_and_pagination,
    page_meta,
    pagination_params,
)
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.domain.stock_engine import apply_move
from app.models.entities import SKU, StockBalance, StockMove, User
from app.models.enums import MoveType
from app.schemas.stock import (
    StockAdjustmentIn,
    StockBalanceListOut,
    StockBalanceOut,
    StockIssueIn,
    StockMoveListOut,
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
    response_model=StockBalanceListOut,
    dependencies=[Depends(require_permission("stock.balance.read"))],
)
async def list_balances(
    branch_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    product_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> StockBalanceListOut:
    stmt = select(StockBalance).join(SKU, SKU.id == StockBalance.sku_id)
    if branch_id is not None:
        stmt = stmt.where(StockBalance.branch_id == branch_id)
    if sku_id is not None:
        stmt = stmt.where(StockBalance.sku_id == sku_id)
    if product_id is not None:
        stmt = stmt.where(SKU.product_id == product_id)
    if location_id is not None:
        stmt = stmt.where(StockBalance.location_id == location_id)
    if params.q:
        stmt = stmt.where(
            or_(
                SKU.sku_code.ilike(f"%{params.q}%"),
                SKU.name.ilike(f"%{params.q}%"),
            )
        )

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=StockBalance,
        params=params,
        allowed_sort_fields={
            "id",
            "updated_at",
            "on_hand",
            "branch_id",
            "sku_id",
            "location_id",
        },
        default_sort="updated_at",
    )

    rows = await session.scalars(stmt)
    items = [StockBalanceOut.model_validate(row) for row in rows.all()]
    return StockBalanceListOut(
        items=items,
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/moves",
    response_model=StockMoveListOut,
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
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> StockMoveListOut:
    def _apply_filters(stmt: Any) -> Any:
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
        if params.q:
            stmt = stmt.where(
                or_(
                    SKU.sku_code.ilike(f"%{params.q}%"),
                    SKU.name.ilike(f"%{params.q}%"),
                    StockMove.reason.ilike(f"%{params.q}%"),
                    StockMove.reference_id.ilike(f"%{params.q}%"),
                )
            )
        return stmt

    count_stmt = _apply_filters(
        select(func.count())
        .select_from(StockMove)
        .join(SKU, SKU.id == StockMove.sku_id)
    )
    total = await session.scalar(count_stmt) or 0

    running_balance = func.sum(StockMove.qty).over(
        partition_by=(StockMove.branch_id, StockMove.location_id, StockMove.sku_id),
        order_by=(StockMove.occurred_at, StockMove.id),
    )
    stmt = _apply_filters(
        select(StockMove, running_balance.label("balance_after")).join(
            SKU, SKU.id == StockMove.sku_id
        )
    )

    move_sort_fields = {
        "id": StockMove.id,
        "occurred_at": StockMove.occurred_at,
        "created_at": StockMove.created_at,
        "qty": StockMove.qty,
        "move_type": StockMove.move_type,
    }
    sort_column = move_sort_fields.get(params.sort, StockMove.occurred_at)
    stmt = stmt.order_by(
        sort_column.asc() if params.order == "asc" else sort_column.desc()
    )
    stmt = stmt.limit(params.page_size).offset((params.page - 1) * params.page_size)

    rows = (await session.execute(stmt)).all()
    items: list[StockMoveOut] = []
    for row in rows:
        move = row.StockMove
        if move is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="invalid move row",
            )
        items.append(build_move_out(move, int(row.balance_after)))
    return StockMoveListOut(
        items=items,
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )
