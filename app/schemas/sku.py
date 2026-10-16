from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.base import SchemaBase

SKUOrigin = Literal["FOREIGN", "NATIONAL", "EXPORTED_NO_EXIT"]
NCM_PATTERN = r"^\d{8}$"


class SKUCreate(SchemaBase):
    product_id: int
    sku_code: str
    name: str | None = None
    barcode: str | None = None
    unit: str = "UN"
    attributes: dict | None = None
    cost: Decimal = Field(default=Decimal("0"))
    price: Decimal = Field(default=Decimal("0"))
    tax_code: str | None = None
    ncm: str | None = Field(default=None, pattern=NCM_PATTERN)
    origin: SKUOrigin | None = None
    restricted: bool = False
    active: bool = True


class SKUUpdate(SchemaBase):
    name: str | None = None
    barcode: str | None = None
    unit: str | None = None
    attributes: dict | None = None
    cost: Decimal | None = None
    price: Decimal | None = None
    tax_code: str | None = None
    ncm: str | None = Field(default=None, pattern=NCM_PATTERN)
    origin: SKUOrigin | None = None
    restricted: bool | None = None
    active: bool | None = None


class AddBarcodeIn(SchemaBase):
    barcodes: list[str]


class SKUOut(SchemaBase):
    id: int
    product_id: int
    sku_code: str
    name: str | None
    barcode: str | None
    unit: str
    attributes: dict | None
    cost: Decimal
    price: Decimal
    tax_code: str | None
    ncm: str | None
    origin: str | None
    restricted: bool
    active: bool


class SKUListOut(SchemaBase):
    items: list[SKUOut]
    meta: dict[str, int | None]
