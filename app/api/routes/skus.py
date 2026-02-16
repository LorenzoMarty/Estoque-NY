from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import SKU, Product
from app.schemas.sku import SKUCreate, SKUOut

router = APIRouter(prefix="/skus", tags=["skus"])


@router.post("", response_model=SKUOut, status_code=status.HTTP_201_CREATED)
async def create_sku(
    payload: SKUCreate,
    session: AsyncSession = Depends(get_session),
) -> SKU:
    product_exists = await session.scalar(
        select(Product.id).where(Product.id == payload.product_id)
    )
    if product_exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"product {payload.product_id} not found",
        )

    sku = SKU(
        product_id=payload.product_id,
        sku_code=payload.sku_code,
        barcode=payload.barcode,
        unit=payload.unit,
        active=payload.active,
    )
    session.add(sku)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="sku_code or barcode already exists",
        ) from exc

    await session.refresh(sku)
    return sku


@router.get("", response_model=list[SKUOut])
async def list_skus(session: AsyncSession = Depends(get_session)) -> list[SKU]:
    result = await session.scalars(select(SKU).order_by(SKU.id))
    return list(result.all())
