from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.models.entities import User
from app.schemas.location import (
    LocationCreate,
    LocationListOut,
    LocationOut,
    LocationUpdate,
)
from app.services import admin_entities_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post(
    "",
    response_model=LocationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("location.create"))],
)
async def create_location(
    payload: LocationCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LocationOut:
    try:
        location = await admin_entities_service.create_location(
            session,
            payload=payload,
        )
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="location.create",
            resource_type="location",
            resource_id=location.id,
            before=None,
            after=LocationOut.model_validate(location).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(location)
    return LocationOut.model_validate(location)


@router.get(
    "",
    response_model=LocationListOut,
    dependencies=[Depends(require_permission("location.read"))],
)
async def list_locations(
    branch_id: int | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> LocationListOut:
    rows, total = await admin_entities_service.list_locations(
        session,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
        order=params.order,
        branch_id=branch_id,
        q=params.q,
    )
    return LocationListOut(
        items=[LocationOut.model_validate(row) for row in rows],
        meta=page_meta(
            total=int(total),
            page=params.page,
            page_size=params.page_size,
        ),
    )


@router.get(
    "/{location_id}",
    response_model=LocationOut,
    dependencies=[Depends(require_permission("location.read"))],
)
async def get_location(
    location_id: int,
    session: AsyncSession = Depends(get_session),
) -> LocationOut:
    try:
        location = await admin_entities_service.get_location_or_error(
            session,
            location_id=location_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return LocationOut.model_validate(location)


@router.put(
    "/{location_id}",
    response_model=LocationOut,
    dependencies=[Depends(require_permission("location.update"))],
)
async def update_location(
    location_id: int,
    payload: LocationUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> LocationOut:
    try:
        current = await admin_entities_service.get_location_or_error(
            session,
            location_id=location_id,
        )
        before = LocationOut.model_validate(current).model_dump(mode="json")
        location = await admin_entities_service.update_location(
            session,
            location_id=location_id,
            payload=payload,
        )
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="location.update",
            resource_type="location",
            resource_id=location.id,
            before=before,
            after=LocationOut.model_validate(location).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(location)
    return LocationOut.model_validate(location)


@router.delete(
    "/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("location.delete"))],
)
async def delete_location(
    location_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        current = await admin_entities_service.get_location_or_error(
            session,
            location_id=location_id,
        )
        before = LocationOut.model_validate(current).model_dump(mode="json")
        await admin_entities_service.delete_location(session, location_id=location_id)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="location.delete",
            resource_type="location",
            resource_id=location_id,
            before=before,
            after=None,
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise
