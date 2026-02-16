from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import apply_order_and_pagination, page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import Brand, Category, User
from app.schemas.catalog import BrandCreate, BrandOut, CategoryCreate, CategoryOut
from app.services.audit_service import write_audit_log

router = APIRouter(tags=["catalog"])


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("category.create"))],
)
async def create_category(
    payload: CategoryCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Category:
    category = Category(name=payload.name)
    session.add(category)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="category name already exists",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="category.create",
        resource_type="category",
        resource_id=category.id,
        before=None,
        after={"name": category.name},
    )
    await session.commit()
    await session.refresh(category)
    return category


@router.get(
    "/categories",
    dependencies=[Depends(require_permission("category.read"))],
)
async def list_categories(
    request: Request,
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(Category)
    if params.q:
        stmt = stmt.where(Category.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=Category,
        params=params,
        allowed_sort_fields={"id", "name", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return {
        "items": [CategoryOut.model_validate(row).model_dump() for row in rows],
        "meta": page_meta(
            total=int(total), page=params.page, page_size=params.page_size
        ),
    }


@router.post(
    "/brands",
    response_model=BrandOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("brand.create"))],
)
async def create_brand(
    payload: BrandCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Brand:
    brand = Brand(name=payload.name)
    session.add(brand)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="brand name already exists",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="brand.create",
        resource_type="brand",
        resource_id=brand.id,
        before=None,
        after={"name": brand.name},
    )
    await session.commit()
    await session.refresh(brand)
    return brand


@router.get(
    "/brands",
    dependencies=[Depends(require_permission("brand.read"))],
)
async def list_brands(
    request: Request,
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(Brand)
    if params.q:
        stmt = stmt.where(Brand.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=Brand,
        params=params,
        allowed_sort_fields={"id", "name", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return {
        "items": [BrandOut.model_validate(row).model_dump() for row in rows],
        "meta": page_meta(
            total=int(total), page=params.page, page_size=params.page_size
        ),
    }
