from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import Product
from app.schemas.product import ProductCreate, ProductOut

router = APIRouter(prefix="/products", tags=["products"])


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    session: AsyncSession = Depends(get_session),
) -> Product:
    product = Product(
        name=payload.name,
        brand=payload.brand,
        active=payload.active,
    )
    session.add(product)
    await session.commit()
    await session.refresh(product)
    return product


@router.get("", response_model=list[ProductOut])
async def list_products(
    active: bool | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Product]:
    stmt = select(Product).order_by(Product.id)
    if active is not None:
        stmt = stmt.where(Product.active == active)

    result = await session.scalars(stmt)
    return list(result.all())
