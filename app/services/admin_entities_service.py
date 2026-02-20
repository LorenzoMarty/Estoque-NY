from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.entities import Branch, Brand, Location
from app.repositories import admin_repository
from app.schemas.branch import BranchCreate, BranchUpdate
from app.schemas.catalog import BrandCreate, BrandUpdate
from app.schemas.location import LocationCreate, LocationUpdate


async def list_branches(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    q: str | None,
) -> tuple[list[Branch], int]:
    return await admin_repository.list_branches(
        session,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        q=q,
    )


async def get_branch_or_error(
    session: AsyncSession,
    *,
    branch_id: int,
) -> Branch:
    branch = await admin_repository.get_branch(session, branch_id=branch_id)
    if branch is None:
        raise NotFoundError(f"branch {branch_id} not found")
    return branch


async def create_branch(
    session: AsyncSession,
    *,
    payload: BranchCreate,
) -> Branch:
    try:
        return await admin_repository.create_branch(session, name=payload.name)
    except IntegrityError as exc:
        raise ConflictError("branch name already exists") from exc


async def update_branch(
    session: AsyncSession,
    *,
    branch_id: int,
    payload: BranchUpdate,
) -> Branch:
    branch = await get_branch_or_error(session, branch_id=branch_id)
    try:
        return await admin_repository.update_branch(
            session,
            branch=branch,
            name=payload.name,
        )
    except IntegrityError as exc:
        raise ConflictError("branch name already exists") from exc


async def delete_branch(
    session: AsyncSession,
    *,
    branch_id: int,
) -> Branch:
    branch = await get_branch_or_error(session, branch_id=branch_id)
    locations_total = await admin_repository.count_branch_locations(
        session,
        branch_id=branch_id,
    )
    if locations_total > 0:
        raise ValidationError("cannot delete branch with associated locations")
    try:
        await admin_repository.delete_branch(session, branch=branch)
    except IntegrityError as exc:
        raise ValidationError("cannot delete branch due to related records") from exc
    return branch


async def list_locations(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    branch_id: int | None,
    q: str | None,
) -> tuple[list[Location], int]:
    return await admin_repository.list_locations(
        session,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        branch_id=branch_id,
        q=q,
    )


async def get_location_or_error(
    session: AsyncSession,
    *,
    location_id: int,
) -> Location:
    location = await admin_repository.get_location(session, location_id=location_id)
    if location is None:
        raise NotFoundError(f"location {location_id} not found")
    return location


async def create_location(
    session: AsyncSession,
    *,
    payload: LocationCreate,
) -> Location:
    if not await admin_repository.branch_exists(session, branch_id=payload.branch_id):
        raise NotFoundError(f"branch {payload.branch_id} not found")
    try:
        return await admin_repository.create_location(
            session,
            branch_id=payload.branch_id,
            name=payload.name,
            location_type=payload.type,
        )
    except IntegrityError as exc:
        raise ConflictError("location already exists for branch") from exc


async def update_location(
    session: AsyncSession,
    *,
    location_id: int,
    payload: LocationUpdate,
) -> Location:
    location = await get_location_or_error(session, location_id=location_id)
    if not await admin_repository.branch_exists(session, branch_id=payload.branch_id):
        raise NotFoundError(f"branch {payload.branch_id} not found")
    try:
        return await admin_repository.update_location(
            session,
            location=location,
            branch_id=payload.branch_id,
            name=payload.name,
            location_type=payload.type,
        )
    except IntegrityError as exc:
        raise ConflictError("location already exists for branch") from exc


async def delete_location(
    session: AsyncSession,
    *,
    location_id: int,
) -> Location:
    location = await get_location_or_error(session, location_id=location_id)
    try:
        await admin_repository.delete_location(session, location=location)
    except IntegrityError as exc:
        raise ValidationError("cannot delete location due to related records") from exc
    return location


async def list_brands(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    q: str | None,
) -> tuple[list[Brand], int]:
    return await admin_repository.list_brands(
        session,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        q=q,
    )


async def get_brand_or_error(
    session: AsyncSession,
    *,
    brand_id: int,
) -> Brand:
    brand = await admin_repository.get_brand(session, brand_id=brand_id)
    if brand is None:
        raise NotFoundError(f"brand {brand_id} not found")
    return brand


async def create_brand(
    session: AsyncSession,
    *,
    payload: BrandCreate,
) -> Brand:
    try:
        return await admin_repository.create_brand(session, name=payload.name)
    except IntegrityError as exc:
        raise ConflictError("brand name already exists") from exc


async def update_brand(
    session: AsyncSession,
    *,
    brand_id: int,
    payload: BrandUpdate,
) -> Brand:
    brand = await get_brand_or_error(session, brand_id=brand_id)
    try:
        return await admin_repository.update_brand(
            session,
            brand=brand,
            name=payload.name,
        )
    except IntegrityError as exc:
        raise ConflictError("brand name already exists") from exc


async def delete_brand(
    session: AsyncSession,
    *,
    brand_id: int,
) -> Brand:
    brand = await get_brand_or_error(session, brand_id=brand_id)
    try:
        await admin_repository.delete_brand(session, brand=brand)
    except IntegrityError as exc:
        raise ValidationError("cannot delete brand due to related records") from exc
    return brand
