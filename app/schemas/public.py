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


class PublicBranchOut(SchemaBase):
    """Store contact card. Never carries the internal id, costs or quantities."""

    name: str
    address: str | None
    phone: str | None
    opening_hours: dict[str, str | None] | None
    timezone: str | None


class PublicBranchesOut(SchemaBase):
    branches: list[PublicBranchOut]


class PublicSectorOut(SchemaBase):
    name: str
    products: list[PublicProductOut]


class PublicCatalogMeta(SchemaBase):
    page: int
    page_size: int
    total_products: int
    has_more: bool


class PublicCatalogOut(SchemaBase):
    # Products are paginated before they are grouped, so a sector can continue on
    # the next page; consumers merge sectors by name.
    sectors: list[PublicSectorOut]
    meta: PublicCatalogMeta
