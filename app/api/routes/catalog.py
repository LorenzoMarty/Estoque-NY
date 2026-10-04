from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import apply_order_and_pagination, page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.models.entities import Category, User
from app.schemas.catalog import (
    BrandCreate,
    BrandListOut,
    BrandOut,
    BrandUpdate,
    CategoryCreate,
    CategoryOut,
)
from app.services import admin_entities_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("catalog.category.create"))],
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
    dependencies=[Depends(require_permission("catalog.category.read"))],
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
    dependencies=[Depends(require_permission("catalog.brand.create"))],
)
async def create_brand(
    payload: BrandCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BrandOut:
    try:
        brand = await admin_entities_service.create_brand(session, payload=payload)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="brand.create",
            resource_type="brand",
            resource_id=brand.id,
            before=None,
            after=BrandOut.model_validate(brand).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(brand)
    return BrandOut.model_validate(brand)


@router.get(
    "/brands",
    response_model=BrandListOut,
    dependencies=[Depends(require_permission("catalog.brand.read"))],
)
async def list_brands(
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> BrandListOut:
    rows, total = await admin_entities_service.list_brands(
        session,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
        order=params.order,
        q=params.q,
    )
    return BrandListOut(
        items=[BrandOut.model_validate(row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/brands/{brand_id}",
    response_model=BrandOut,
    dependencies=[Depends(require_permission("catalog.brand.read"))],
)
async def get_brand(
    brand_id: int,
    session: AsyncSession = Depends(get_session),
) -> BrandOut:
    try:
        brand = await admin_entities_service.get_brand_or_error(
            session,
            brand_id=brand_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return BrandOut.model_validate(brand)


@router.put(
    "/brands/{brand_id}",
    response_model=BrandOut,
    dependencies=[Depends(require_permission("catalog.brand.update"))],
)
async def update_brand(
    brand_id: int,
    payload: BrandUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BrandOut:
    try:
        current = await admin_entities_service.get_brand_or_error(
            session,
            brand_id=brand_id,
        )
        before = BrandOut.model_validate(current).model_dump(mode="json")
        brand = await admin_entities_service.update_brand(
            session,
            brand_id=brand_id,
            payload=payload,
        )
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="brand.update",
            resource_type="brand",
            resource_id=brand.id,
            before=before,
            after=BrandOut.model_validate(brand).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(brand)
    return BrandOut.model_validate(brand)


@router.delete(
    "/brands/{brand_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("catalog.brand.delete"))],
)
async def delete_brand(
    brand_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        current = await admin_entities_service.get_brand_or_error(
            session,
            brand_id=brand_id,
        )
        before = BrandOut.model_validate(current).model_dump(mode="json")
        await admin_entities_service.delete_brand(session, brand_id=brand_id)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="brand.delete",
            resource_type="brand",
            resource_id=brand_id,
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
