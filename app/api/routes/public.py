from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import SKU, Brand, Category, Product, StockBalance
from app.schemas.public import PublicCatalogOut, PublicProductOut, PublicSectorOut

router = APIRouter(prefix="/public", tags=["public"])

FALLBACK_SECTOR = "Outros"
_CENTS = Decimal("0.01")


@router.get("/catalog", response_model=PublicCatalogOut)
async def public_catalog(
    session: AsyncSession = Depends(get_session),
) -> PublicCatalogOut:
    """Read-only storefront feed. Exposes no cost, SKU codes, quantities or branches."""
    rows = (
        await session.execute(
            select(Product, Category.name, Brand.name)
            .join(Category, Category.id == Product.category_id, isouter=True)
            .join(Brand, Brand.id == Product.brand_id, isouter=True)
            .where(Product.published.is_(True), Product.active.is_(True))
            .order_by(Product.featured.desc(), Product.name)
        )
    ).all()
    product_ids = [product.id for product, _, _ in rows]

    priced = case((SKU.price > 0, SKU.price))
    prices = {
        row.product_id: (row.low, row.high)
        for row in await session.execute(
            select(
                SKU.product_id,
                func.min(priced).label("low"),
                func.max(priced).label("high"),
            )
            .where(SKU.active.is_(True), SKU.product_id.in_(product_ids))
            .group_by(SKU.product_id)
        )
    }
    stocked = set(
        await session.scalars(
            select(SKU.product_id)
            .join(StockBalance, StockBalance.sku_id == SKU.id)
            .where(
                SKU.active.is_(True),
                SKU.product_id.in_(product_ids),
                StockBalance.on_hand > 0,
            )
            .distinct()
        )
    )

    sectors: dict[str, list[PublicProductOut]] = {}
    for product, category_name, brand_name in rows:
        low, high = prices.get(product.id, (None, None))
        sectors.setdefault(category_name or FALLBACK_SECTOR, []).append(
            PublicProductOut(
                id=product.id,
                brand=brand_name or product.brand,
                name=product.name,
                description=product.description,
                price_usd=None if low is None else Decimal(low).quantize(_CENTS),
                price_is_from=low is not None and low != high,
                featured=product.featured,
                image_url=product.image_url,
                in_stock=product.id in stocked,
            )
        )

    ordered = sorted(sectors, key=lambda name: (name == FALLBACK_SECTOR, name))
    return PublicCatalogOut(
        sectors=[PublicSectorOut(name=name, products=sectors[name]) for name in ordered]
    )
