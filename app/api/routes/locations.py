from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import Branch, Location
from app.schemas.location import LocationCreate, LocationOut

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: LocationCreate,
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
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="location already exists for branch",
        ) from exc

    await session.refresh(location)
    return location


@router.get("", response_model=list[LocationOut])
async def list_locations(
    branch_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Location]:
    stmt = select(Location).order_by(Location.id)
    if branch_id is not None:
        stmt = stmt.where(Location.branch_id == branch_id)
    result = await session.scalars(stmt)
    return list(result.all())
