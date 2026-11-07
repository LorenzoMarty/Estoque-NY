from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.base import SchemaBase


class SaleItemIn(SchemaBase):
    sku_id: int
    qty: int = Field(..., gt=0)
    # Defaults to the current price of the SKU.
    unit_price: Decimal | None = Field(default=None, ge=0)


class SaleIn(SchemaBase):
    branch_id: int
    location_id: int | None = None
    customer_id: int | None = None
    items: list[SaleItemIn] = Field(..., min_length=1)
    sold_at: datetime | None = None
    # Needs sales.sale.override_closed_day; the audit log records it.
    override_closed_day: bool = False


class VoidIn(SchemaBase):
    reason: str = Field(..., min_length=3, max_length=255)
    override_closed_day: bool = False


class SaleItemOut(SchemaBase):
    sku_id: int
    qty: int
    unit_price: Decimal
    issue_move_id: int | None


class SaleOut(SchemaBase):
    id: int
    branch_id: int
    customer_id: int | None
    source: str
    external_id: str | None
    status: str
    total: Decimal
    sold_at: datetime
    voided_at: datetime | None
    void_reason: str | None
    items: list[SaleItemOut]
