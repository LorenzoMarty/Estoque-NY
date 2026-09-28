from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import exists, func, select
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
from app.domain.transfer_service import (
    cancel_transfer,
    create_transfer,
    receive_transfer,
    ship_transfer,
)
from app.models.entities import TransferOrder, TransferOrderItem, User
from app.models.enums import TransferStatus
from app.schemas.transfer import (
    TransferCreateIn,
    TransferItemOut,
    TransferListOut,
    TransferOut,
)
from app.services.audit_service import write_audit_log
from app.services.idempotency_service import (
    abort_idempotency,
    begin_idempotency,
    finish_idempotency,
)

router = APIRouter(prefix="/stock/transfers", tags=["stock-transfers"])


async def _to_transfer_out(
    session: AsyncSession,
    transfer: TransferOrder,
) -> TransferOut:
    items = list(
        (
            await session.scalars(
                select(TransferOrderItem).where(
                    TransferOrderItem.transfer_id == transfer.id
                )
            )
        ).all()
    )
    return TransferOut(
        id=transfer.id,
        from_branch_id=transfer.from_branch_id,
        from_location_id=transfer.from_location_id,
        to_branch_id=transfer.to_branch_id,
        to_location_id=transfer.to_location_id,
        status=transfer.status,
        note=transfer.note,
        created_by=transfer.created_by,
        created_at=transfer.created_at,
        shipped_at=transfer.shipped_at,
        received_at=transfer.received_at,
        items=[
            TransferItemOut(
                id=item.id,
                transfer_id=item.transfer_id,
                sku_id=item.sku_id,
                qty=item.qty,
            )
            for item in items
        ],
    )


@router.post(
    "",
    response_model=TransferOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("stock.transfer.create"))],
)
async def create_transfer_order(
    payload: TransferCreateIn,
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
        transfer = await create_transfer(
            session=session,
            payload=payload,
            user_id=current_user.id if current_user else None,
        )
        result = await _to_transfer_out(session, transfer)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.transfer.create",
            resource_type="transfer_order",
            resource_id=transfer.id,
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


@router.get(
    "",
    response_model=TransferListOut,
    dependencies=[Depends(require_permission("stock.transfer.read"))],
)
async def list_transfer_orders(
    status_filter: TransferStatus | None = Query(default=None, alias="status"),
    branch_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    sku_id: int | None = Query(default=None),
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> TransferListOut:
    stmt = select(TransferOrder)
    if status_filter is not None:
        stmt = stmt.where(TransferOrder.status == status_filter)
    if branch_id is not None:
        stmt = stmt.where(
            (TransferOrder.from_branch_id == branch_id)
            | (TransferOrder.to_branch_id == branch_id)
        )
    if location_id is not None:
        stmt = stmt.where(
            (TransferOrder.from_location_id == location_id)
            | (TransferOrder.to_location_id == location_id)
        )
    if sku_id is not None:
        stmt = stmt.where(
            exists(
                select(1).where(
                    TransferOrderItem.transfer_id == TransferOrder.id,
                    TransferOrderItem.sku_id == sku_id,
                )
            )
        )

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=TransferOrder,
        params=params,
        allowed_sort_fields={"id", "created_at", "status", "shipped_at", "received_at"},
    )

    transfers = list((await session.scalars(stmt)).all())
    items = [await _to_transfer_out(session, transfer) for transfer in transfers]
    return TransferListOut(
        items=items,
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/{transfer_id}",
    response_model=TransferOut,
    dependencies=[Depends(require_permission("stock.transfer.read"))],
)
async def get_transfer_order(
    transfer_id: int,
    session: AsyncSession = Depends(get_session),
) -> TransferOut:
    transfer = await session.scalar(
        select(TransferOrder).where(TransferOrder.id == transfer_id)
    )
    if transfer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"transfer {transfer_id} not found",
        )
    return await _to_transfer_out(session, transfer)


@router.post(
    "/{transfer_id}/ship",
    response_model=TransferOut,
    dependencies=[Depends(require_permission("stock.transfer.ship"))],
)
async def ship_transfer_order(
    transfer_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"transfer_id": transfer_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        transfer = await ship_transfer(
            session=session,
            transfer_id=transfer_id,
            user_id=current_user.id if current_user else None,
        )
        result = await _to_transfer_out(session, transfer)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.transfer.ship",
            resource_type="transfer_order",
            resource_id=transfer.id,
            before={"status": TransferStatus.DRAFT.value},
            after={"status": transfer.status.value},
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
    "/{transfer_id}/receive",
    response_model=TransferOut,
    dependencies=[Depends(require_permission("stock.transfer.receive"))],
)
async def receive_transfer_order(
    transfer_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"transfer_id": transfer_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        transfer = await receive_transfer(
            session=session,
            transfer_id=transfer_id,
            user_id=current_user.id if current_user else None,
        )
        result = await _to_transfer_out(session, transfer)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.transfer.receive",
            resource_type="transfer_order",
            resource_id=transfer.id,
            before={"status": TransferStatus.SHIPPED.value},
            after={"status": transfer.status.value},
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
    "/{transfer_id}/cancel",
    response_model=TransferOut,
    dependencies=[Depends(require_permission("stock.transfer.cancel"))],
)
async def cancel_transfer_order(
    transfer_id: int,
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    idempotency = await begin_idempotency(request, {"transfer_id": transfer_id})
    if idempotency.is_replay:
        response.status_code = idempotency.replay_status_code or status.HTTP_200_OK
        return idempotency.replay_response

    try:
        transfer = await cancel_transfer(session=session, transfer_id=transfer_id)
        result = await _to_transfer_out(session, transfer)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="stock.transfer.cancel",
            resource_type="transfer_order",
            resource_id=transfer.id,
            before=None,
            after={"status": transfer.status.value},
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
