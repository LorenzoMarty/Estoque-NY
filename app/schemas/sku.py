from app.schemas.base import SchemaBase


class SKUCreate(SchemaBase):
    product_id: int
    sku_code: str
    barcode: str | None = None
    unit: str = "un"
    active: bool = True


class SKUOut(SchemaBase):
    id: int
    product_id: int
    sku_code: str
    barcode: str | None
    unit: str
    active: bool
