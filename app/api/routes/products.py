from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import Brand, Category, Product, User
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/catalog/products", tags=["products"])


async def _validate_catalog_refs(
    session: AsyncSession,
    *,
    category_id: int | None,
    brand_id: int | None,
) -> None:
    if category_id is not None:
        category = await session.scalar(
            select(Category.id).where(Category.id == category_id)
        )
        if category is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"category {category_id} not found",
            )
    if brand_id is not None:
        brand = await session.scalar(select(Brand.id).where(Brand.id == brand_id))
        if brand is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"brand {brand_id} not found",
            )


@router.post(
    "",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("product.create"))],
)
async def create_product(
    payload: ProductCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Product:
    await _validate_catalog_refs(
        session,
        category_id=payload.category_id,
        brand_id=payload.brand_id,
    )

    product = Product(
        name=payload.name,
        description=payload.description,
        category_id=payload.category_id,
        brand_id=payload.brand_id,
        brand=payload.brand,
        active=payload.active,
    )
    session.add(product)
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="product.create",
        resource_type="product",
        resource_id=product.id,
        before=None,
        after=ProductOut.model_validate(product).model_dump(),
    )
    await session.commit()
    await session.refresh(product)
    return product


@router.patch(
    "/{product_id}",
    response_model=ProductOut,
    dependencies=[Depends(require_permission("product.update"))],
)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Product:
    product = await session.scalar(select(Product).where(Product.id == product_id))
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"product {product_id} not found",
        )

    await _validate_catalog_refs(
        session,
        category_id=payload.category_id,
        brand_id=payload.brand_id,
    )

    before = ProductOut.model_validate(product).model_dump()
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(product, key, value)
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="product.update",
        resource_type="product",
        resource_id=product.id,
        before=before,
        after=ProductOut.model_validate(product).model_dump(),
    )
    await session.commit()
    await session.refresh(product)
    return product


@router.get(
    "",
    response_model=list[ProductOut],
    dependencies=[Depends(require_permission("product.read"))],
)
async def list_products(
    active: bool | None = Query(default=None),
    category_id: int | None = Query(default=None),
    brand_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("id"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Product]:
    stmt = select(Product)
    if active is not None:
        stmt = stmt.where(Product.active == active)
    if category_id is not None:
        stmt = stmt.where(Product.category_id == category_id)
    if brand_id is not None:
        stmt = stmt.where(Product.brand_id == brand_id)
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q}%"))

    if sort not in {"id", "name", "created_at"}:
        sort = "id"
    column = getattr(Product, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    result = await session.scalars(stmt)
    return list(result.all())
