"""Sales ledger routes (issue #32, ADR 0005).

A sale issues its stock in the same transaction, so a failing line leaves nothing
behind. `POST /sales` honours `Idempotency-Key` (a retry replays the first answer).
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.security import get_current_user, require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, page_meta
from app.domain.errors import DomainError
from app.domain.sales import create_sale, void_sale
from app.models.entities import Sale, SaleItem, User
from app.schemas.sale import SaleIn, SaleItemOut, SaleOut, VoidIn
from app.services.audit_service import write_audit_log
from app.services.idempotency_service import (
    abort_idempotency,
    begin_idempotency,
    finish_idempotency,
)

router = APIRouter(prefix="/sales", tags=["sales"])


async def sale_out(session: AsyncSession, sale: Sale) -> SaleOut:
    lines = await session.scalars(
        select(SaleItem).where(SaleItem.sale_id == sale.id).order_by(SaleItem.id)
    )
    return SaleOut(
        id=sale.id,
        branch_id=sale.branch_id,
        customer_id=sale.customer_id,
        source=sale.source,
        external_id=sale.external_id,
        status=sale.status,
        total=sale.total,
        sold_at=sale.sold_at,
        voided_at=sale.voided_at,
        void_reason=sale.void_reason,
        items=[SaleItemOut.model_validate(i) for i in lines],
    )


@router.post(
    "",
    response_model=SaleOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sales.sale.create", branch_scoped=True))],
)
async def register_sale(
    payload: SaleIn,
    request: Request,
    response: Response,
    user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> Any:
    scope.require(payload.branch_id)
    idempotency = await begin_idempotency(request, payload.model_dump(mode="json"))
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        sale = await create_sale(
            session,
            branch_id=payload.branch_id,
            items=[(i.sku_id, i.qty, i.unit_price) for i in payload.items],
            location_id=payload.location_id,
            customer_id=payload.customer_id,
            sold_at=payload.sold_at,
            created_by=user.id if user else None,
        )
        result = await sale_out(session, sale)
        await write_audit_log(
            session,
            request=request,
            user_id=user.id if user else None,
            action="sales.sale.create",
            resource_type="sale",
            resource_id=sale.id,
            after=result.model_dump(mode="json"),
            branch_id=sale.branch_id,
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
    return result


@router.get(
    "",
    dependencies=[Depends(require_permission("sales.sale.read", branch_scoped=True))],
)
async def list_sales(
    branch_id: int | None = Query(default=None),
    sale_status: str | None = Query(default=None, alias="status"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = scope.apply(select(Sale), Sale.branch_id, branch_id)
    if sale_status:
        stmt = stmt.where(Sale.status == sale_status.upper())
    if date_from:
        stmt = stmt.where(Sale.sold_at >= date_from)
    if date_to:
        stmt = stmt.where(Sale.sold_at < date_to)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await session.scalars(
            stmt.order_by(Sale.sold_at.desc(), Sale.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()
    return {
        "items": [(await sale_out(session, s)).model_dump(mode="json") for s in rows],
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


async def _scoped_sale(session: AsyncSession, scope: BranchScope, sale_id: int) -> Sale:
    sale = await session.get(Sale, sale_id)
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "sale not found")
    scope.require(sale.branch_id)
    return sale


@router.get(
    "/{sale_id}",
    response_model=SaleOut,
    dependencies=[Depends(require_permission("sales.sale.read", branch_scoped=True))],
)
async def get_sale(
    sale_id: int,
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> Any:
    return await sale_out(session, await _scoped_sale(session, scope, sale_id))


@router.post(
    "/{sale_id}/void",
    response_model=SaleOut,
    dependencies=[Depends(require_permission("sales.sale.void", branch_scoped=True))],
)
async def void_sale_route(
    sale_id: int,
    payload: VoidIn,
    request: Request,
    user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Cancel a sale and put its stock back (same lots, same location)."""
    sale = await _scoped_sale(session, scope, sale_id)
    try:
        await void_sale(session, sale, payload.reason, user.id if user else None)
        result = await sale_out(session, sale)
        await write_audit_log(
            session,
            request=request,
            user_id=user.id if user else None,
            action="sales.sale.void",
            resource_type="sale",
            resource_id=sale.id,
            after={"status": sale.status, "reason": payload.reason},
            branch_id=sale.branch_id,
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    return result
