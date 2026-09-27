from datetime import datetime

from app.schemas.base import SchemaBase


class ProductCreate(SchemaBase):
    name: str
    description: str | None = None
    category_id: int | None = None
    brand_id: int | None = None
    brand: str | None = None
    active: bool = True


class ProductUpdate(SchemaBase):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    brand_id: int | None = None
    brand: str | None = None
    active: bool | None = None


class ProductOut(SchemaBase):
    id: int
    name: str
    description: str | None
    category_id: int | None
    brand_id: int | None
    brand: str | None
    active: bool
    created_at: datetime


class ProductListOut(SchemaBase):
    items: list[ProductOut]
    meta: dict[str, int | None]
