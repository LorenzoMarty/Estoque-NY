from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import Branch, Location, User
from app.schemas.location import LocationCreate, LocationOut
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
) -> Location:
    branch_exists = await session.scalar(
        select(Branch.id).where(Branch.id == payload.branch_id)
    )
    if branch_exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"branch {payload.branch_id} not found",
        )

    location = Location(
        branch_id=payload.branch_id,
        name=payload.name,
        type=payload.type,
    )
    session.add(location)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="location already exists for branch",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="location.create",
        resource_type="location",
        resource_id=location.id,
        before=None,
        after={"name": location.name, "type": location.type.value},
    )
    await session.commit()
    await session.refresh(location)
    return location


@router.get(
    "",
    response_model=list[LocationOut],
    dependencies=[Depends(require_permission("location.read"))],
)
async def list_locations(
    branch_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("id"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Location]:
    stmt = select(Location)
    if branch_id is not None:
        stmt = stmt.where(Location.branch_id == branch_id)
    if q:
        stmt = stmt.where(Location.name.ilike(f"%{q}%"))

    if sort not in {"id", "name", "branch_id"}:
        sort = "id"
    column = getattr(Location, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    result = await session.scalars(stmt)
    return list(result.all())
