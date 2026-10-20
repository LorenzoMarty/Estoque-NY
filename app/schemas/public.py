from decimal import Decimal

from app.schemas.base import SchemaBase


class PublicProductOut(SchemaBase):
    id: int
    brand: str | None
    name: str
    description: str | None
    price_usd: Decimal | None
    price_is_from: bool
    featured: bool
    image_url: str | None
    in_stock: bool


class PublicSectorOut(SchemaBase):
    name: str
    products: list[PublicProductOut]


class PublicCatalogOut(SchemaBase):
    sectors: list[PublicSectorOut]
