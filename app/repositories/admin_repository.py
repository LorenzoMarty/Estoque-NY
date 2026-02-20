from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Branch, Brand, Location
from app.models.enums import LocationType


async def list_branches(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    q: str | None = None,
) -> tuple[list[Branch], int]:
    stmt = select(Branch)
    if q:
        stmt = stmt.where(Branch.name.ilike(f"%{q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    sort_column = {
        "id": Branch.id,
        "name": Branch.name,
        "created_at": Branch.created_at,
    }.get(sort, Branch.id)
    stmt = stmt.order_by(sort_column.asc() if order == "asc" else sort_column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    rows = list((await session.scalars(stmt)).all())
    return rows, int(total)


async def get_branch(
    session: AsyncSession,
    *,
    branch_id: int,
) -> Branch | None:
    return await session.scalar(select(Branch).where(Branch.id == branch_id))


async def branch_exists(
    session: AsyncSession,
    *,
    branch_id: int,
) -> bool:
    found = await session.scalar(select(Branch.id).where(Branch.id == branch_id))
    return found is not None


async def create_branch(
    session: AsyncSession,
    *,
    name: str,
) -> Branch:
    branch = Branch(name=name)
    session.add(branch)
    await session.flush()
    return branch


async def update_branch(
    session: AsyncSession,
    *,
    branch: Branch,
    name: str,
) -> Branch:
    branch.name = name
    await session.flush()
    return branch


async def delete_branch(
    session: AsyncSession,
    *,
    branch: Branch,
) -> None:
    await session.delete(branch)
    await session.flush()


async def count_branch_locations(
    session: AsyncSession,
    *,
    branch_id: int,
) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Location)
        .where(Location.branch_id == branch_id)
    )
    return int(count or 0)


async def list_locations(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    branch_id: int | None = None,
    q: str | None = None,
) -> tuple[list[Location], int]:
    stmt = select(Location)
    if branch_id is not None:
        stmt = stmt.where(Location.branch_id == branch_id)
    if q:
        stmt = stmt.where(Location.name.ilike(f"%{q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    sort_column = {
        "id": Location.id,
        "name": Location.name,
        "branch_id": Location.branch_id,
        "type": Location.type,
    }.get(sort, Location.id)
    stmt = stmt.order_by(sort_column.asc() if order == "asc" else sort_column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    rows = list((await session.scalars(stmt)).all())
    return rows, int(total)


async def get_location(
    session: AsyncSession,
    *,
    location_id: int,
) -> Location | None:
    return await session.scalar(select(Location).where(Location.id == location_id))


async def create_location(
    session: AsyncSession,
    *,
    branch_id: int,
    name: str,
    location_type: LocationType,
) -> Location:
    location = Location(
        branch_id=branch_id,
        name=name,
        type=location_type,
    )
    session.add(location)
    await session.flush()
    return location


async def update_location(
    session: AsyncSession,
    *,
    location: Location,
    branch_id: int,
    name: str,
    location_type: LocationType,
) -> Location:
    location.branch_id = branch_id
    location.name = name
    location.type = location_type
    await session.flush()
    return location


async def delete_location(
    session: AsyncSession,
    *,
    location: Location,
) -> None:
    await session.delete(location)
    await session.flush()


async def list_brands(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    q: str | None = None,
) -> tuple[list[Brand], int]:
    stmt = select(Brand)
    if q:
        stmt = stmt.where(Brand.name.ilike(f"%{q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    sort_column = {
        "id": Brand.id,
        "name": Brand.name,
        "created_at": Brand.created_at,
    }.get(sort, Brand.id)
    stmt = stmt.order_by(sort_column.asc() if order == "asc" else sort_column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    rows = list((await session.scalars(stmt)).all())
    return rows, int(total)


async def get_brand(
    session: AsyncSession,
    *,
    brand_id: int,
) -> Brand | None:
    return await session.scalar(select(Brand).where(Brand.id == brand_id))


async def create_brand(
    session: AsyncSession,
    *,
    name: str,
) -> Brand:
    brand = Brand(name=name)
    session.add(brand)
    await session.flush()
    return brand


async def update_brand(
    session: AsyncSession,
    *,
    brand: Brand,
    name: str,
) -> Brand:
    brand.name = name
    await session.flush()
    return brand


async def delete_brand(
    session: AsyncSession,
    *,
    brand: Brand,
) -> None:
    await session.delete(brand)
    await session.flush()
