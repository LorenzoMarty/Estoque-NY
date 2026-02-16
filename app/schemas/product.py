from datetime import datetime

from app.schemas.base import SchemaBase


class ProductCreate(SchemaBase):
    name: str
    brand: str | None = None
    active: bool = True


class ProductOut(SchemaBase):
    id: int
    name: str
    brand: str | None
    active: bool
    created_at: datetime
