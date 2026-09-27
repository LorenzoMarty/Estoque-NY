from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import PaginationParams, apply_order_and_pagination, page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.domain.inventory_service import (
    cancel_inventory_count,
    close_inventory_count,
    create_inventory_count,
    patch_inventory_lines,
    post_inventory_count,
)
from app.models.entities import InventoryCount, InventoryCountLine, User
from app.models.enums import InventoryCountStatus
from app.schemas.inventory import (
    InventoryCountCreateIn,
    InventoryCountLineOut,
    InventoryCountListOut,
    InventoryCountOut,
    InventoryCountPatchLinesIn,
)
from app.services.audit_service import write_audit_log
from app.services.idempotency_service import (
    abort_idempotency,
    begin_idempotency,
    finish_idempotency,
)

router = APIRouter(prefix="/stock/inventory-counts", tags=["stock-inventory"])


async def _to_inventory_out(
    session: AsyncSession,
    count: InventoryCount,
) -> InventoryCountOut:
    lines = list(
        (
            await session.scalars(
                select(InventoryCountLine).where(
                    InventoryCountLine.count_id == count.id
                )
            )
        ).all()
    )
    return InventoryCountOut(
        id=count.id,
        branch_id=count.branch_id,
        location_id=count.location_id,
        status=count.status,
        started_at=count.started_at,
        closed_at=count.closed_at,
        posted_at=count.posted_at,
        cancelled_at=count.cancelled_at,
        created_by=count.created_by,
        lines=[InventoryCountLineOut.model_validate(line) for line in lines],
    )


@router.post(
    "",
    response_model=InventoryCountOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("stock.inventory.create"))],
)
async def create_count(
    payload: InventoryCountCreateIn,
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
        count = await create_inventory_count(
            session=session,
            payload=payload,
            user_id=current_user.id if current_user else None,
        )
        result = await _to_inventory_out(session, count)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.inventory.create",
            resource_type="inventory_count",
            resource_id=count.id,
            before=None,
            after=result.model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_201_CREATED,
        response_body=result.model_dump(mode="json"),
    )
    response.status_code = status.HTTP_201_CREATED
    return result


@router.patch(
    "/{count_id}/lines",
    response_model=InventoryCountOut,
    dependencies=[Depends(require_permission("stock.inventory.update"))],
)
async def patch_count_lines(
    count_id: int,
    payload: InventoryCountPatchLinesIn,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(
        request,
        {"count_id": count_id, **payload.model_dump(mode="json")},
    )
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        count = await patch_inventory_lines(
            session=session, count_id=count_id, payload=payload
        )
        result = await _to_inventory_out(session, count)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.inventory.update",
            resource_type="inventory_count",
            resource_id=count.id,
            before=None,
            after={"line_count": len(payload.lines)},
        )
        await session.commit()
    except DomainError as exc:
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_200_OK,
        response_body=result.model_dump(mode="json"),
    )
    return result


@router.post(
    "/{count_id}/close",
    response_model=InventoryCountOut,
    dependencies=[Depends(require_permission("stock.inventory.close"))],
)
async def close_count(
    count_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"count_id": count_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        count = await close_inventory_count(session=session, count_id=count_id)
        result = await _to_inventory_out(session, count)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.inventory.close",
            resource_type="inventory_count",
            resource_id=count.id,
            before={"status": InventoryCountStatus.OPEN.value},
            after={"status": count.status.value},
        )
        await session.commit()
    except DomainError as exc:
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_200_OK,
        response_body=result.model_dump(mode="json"),
    )
    return result


@router.post(
    "/{count_id}/post",
    response_model=InventoryCountOut,
    dependencies=[Depends(require_permission("stock.inventory.post"))],
)
async def post_count(
    count_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"count_id": count_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        count = await post_inventory_count(
            session=session,
            count_id=count_id,
            user_id=current_user.id if current_user else None,
        )
        result = await _to_inventory_out(session, count)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.inventory.post",
            resource_type="inventory_count",
            resource_id=count.id,
            before={"status": InventoryCountStatus.CLOSED.value},
            after={"status": count.status.value},
        )
        await session.commit()
    except DomainError as exc:
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_200_OK,
        response_body=result.model_dump(mode="json"),
    )
    return result


@router.post(
    "/{count_id}/cancel",
    response_model=InventoryCountOut,
    dependencies=[Depends(require_permission("stock.inventory.cancel"))],
)
async def cancel_count(
    count_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"count_id": count_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        count = await cancel_inventory_count(session=session, count_id=count_id)
        result = await _to_inventory_out(session, count)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.inventory.cancel",
            resource_type="inventory_count",
            resource_id=count.id,
            before=None,
            after={"status": count.status.value},
        )
        await session.commit()
    except DomainError as exc:
        await abort_idempotency(idempotency)
        raise domain_error_to_http(exc) from exc
    except Exception:
        await abort_idempotency(idempotency)
        raise

    await finish_idempotency(
        idempotency,
        status_code=status.HTTP_200_OK,
        response_body=result.model_dump(mode="json"),
    )
    return result


@router.get(
    "",
    response_model=InventoryCountListOut,
    dependencies=[Depends(require_permission("stock.inventory.read"))],
)
async def list_counts(
    status_filter: InventoryCountStatus | None = Query(default=None, alias="status"),
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> InventoryCountListOut:
    stmt = select(InventoryCount)
    if status_filter is not None:
        stmt = stmt.where(InventoryCount.status == status_filter)
    if branch_id is not None:
        stmt = stmt.where(InventoryCount.branch_id == branch_id)
    if location_id is not None:
        stmt = stmt.where(InventoryCount.location_id == location_id)
    if from_date is not None:
        stmt = stmt.where(InventoryCount.started_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(InventoryCount.started_at <= to_date)

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=InventoryCount,
        params=params,
        allowed_sort_fields={"id", "started_at", "status", "closed_at", "posted_at"},
        default_sort="started_at",
    )

    counts = list((await session.scalars(stmt)).all())
    items = [await _to_inventory_out(session, count) for count in counts]
    return InventoryCountListOut(
        items=items,
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/{count_id}",
    response_model=InventoryCountOut,
    dependencies=[Depends(require_permission("stock.inventory.create"))],
)
async def get_count(
    count_id: int,
    session: AsyncSession = Depends(get_session),
) -> InventoryCountOut:
    count = await session.scalar(
        select(InventoryCount).where(InventoryCount.id == count_id)
    )
    if count is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"inventory count {count_id} not found",
        )
    return await _to_inventory_out(session, count)
