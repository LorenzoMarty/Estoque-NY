import hashlib
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import SKU, Branch, Brand, Category, Product, StockBalance
from app.schemas.public import (
    PublicBranchesOut,
    PublicBranchOut,
    PublicCatalogMeta,
    PublicCatalogOut,
    PublicProductOut,
    PublicSectorOut,
)

router = APIRouter(prefix="/public", tags=["public"])

FALLBACK_SECTOR = "Outros"
_CENTS = Decimal("0.01")
MAX_PAGE_SIZE = 500
# The feed changes when someone publishes a product; a minute of staleness is fine.
CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"


def _etag(body: bytes) -> str:
    return f'"{hashlib.sha256(body).hexdigest()[:32]}"'


def _client_has(etag: str, if_none_match: str | None) -> bool:
    if not if_none_match:
        return False
    tokens = [token.strip().removeprefix("W/") for token in if_none_match.split(",")]
    return "*" in tokens or etag in tokens


def _cached_json(request: Request, payload: BaseModel) -> Response:
    body = payload.model_dump_json().encode()
    headers = {"ETag": _etag(body), "Cache-Control": CACHE_CONTROL}
    if _client_has(headers["ETag"], request.headers.get("if-none-match")):
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


@router.get("/v1/branches", response_model=PublicBranchesOut)
async def public_branches(
    request: Request, session: AsyncSession = Depends(get_session)
) -> Response:
    """Store contact cards. Only branches with a `public_name` are listed (ADR 0001)."""
    rows = await session.scalars(
        select(Branch)
        .where(Branch.public_name.is_not(None))
        .order_by(Branch.public_name, Branch.id)
    )
    payload = PublicBranchesOut(
        branches=[
            PublicBranchOut(
                name=branch.public_name or "",
                address=branch.address,
                phone=branch.phone,
                opening_hours=branch.opening_hours,
                timezone=branch.timezone,
            )
            for branch in rows
        ]
    )
    return _cached_json(request, payload)


@router.get("/v1/catalog", response_model=PublicCatalogOut)
# Unversioned alias kept so sites deployed before v1 keep working (ADR 0001).
@router.get("/catalog", response_model=PublicCatalogOut, include_in_schema=False)
async def public_catalog(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(MAX_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Read-only storefront feed. Exposes no cost, SKU codes, quantities or branches.

    Cached for a minute and served with an ETag: a request with a matching
    `If-None-Match` gets `304`.
    """
    visible = (Product.published.is_(True), Product.active.is_(True))
    total_products = int(
        await session.scalar(select(func.count()).select_from(Product).where(*visible))
        or 0
    )
    rows = (
        await session.execute(
            select(Product, Category.name, Brand.name)
            .join(Category, Category.id == Product.category_id, isouter=True)
            .join(Brand, Brand.id == Product.brand_id, isouter=True)
            .where(*visible)
            .order_by(Product.featured.desc(), Product.name, Product.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
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
    payload = PublicCatalogOut(
        sectors=[
            PublicSectorOut(name=name, products=sectors[name]) for name in ordered
        ],
        meta=PublicCatalogMeta(
            page=page,
            page_size=page_size,
            total_products=total_products,
            has_more=page * page_size < total_products,
        ),
    )
    return _cached_json(request, payload)
