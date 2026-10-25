from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.models.enums import PurchaseOrderStatus
from app.schemas.base import SchemaBase


def _blank_to_none(value: str | None) -> str | None:
    return " ".join(value.split()) or None if value else None


class SupplierBase(SchemaBase):
    name: str = Field(min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    tax_id: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=2000)
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        name = " ".join(value.split())
        if not name:
            raise ValueError("name cannot be empty")
        return name

    @field_validator("email", "phone", "tax_id")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        return _blank_to_none(value)


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(SupplierBase):
    pass


class SupplierOut(SchemaBase):
    id: int
    name: str
    email: str | None
    phone: str | None
    tax_id: str | None
    notes: str | None
    active: bool
    created_at: datetime


class SupplierListOut(SchemaBase):
    items: list[SupplierOut]
    meta: dict[str, int | None]


class PurchaseOrderLineIn(SchemaBase):
    sku_id: int
    qty: int = Field(gt=0)
    unit_cost: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=4
    )


class PurchaseOrderCreate(SchemaBase):
    supplier_id: int
    branch_id: int
    location_id: int | None = None
    reference: str | None = Field(default=None, max_length=120)
    expected_on: date | None = None
    items: list[PurchaseOrderLineIn] = Field(min_length=1)

    @field_validator("reference")
    @classmethod
    def blank_reference(cls, value: str | None) -> str | None:
        return _blank_to_none(value)

    @model_validator(mode="after")
    def one_line_per_sku(self):
        skus = [line.sku_id for line in self.items]
        if len(skus) != len(set(skus)):
            raise ValueError("each sku can appear once per purchase order")
        return self


class ReceiveLineIn(SchemaBase):
    sku_id: int
    qty: int = Field(gt=0)
    lot_code: str | None = Field(default=None, max_length=60)
    expires_on: date | None = None


class PurchaseReceiveIn(SchemaBase):
    # Overrides the order's receiving location for this delivery.
    location_id: int | None = None
    items: list[ReceiveLineIn] = Field(min_length=1)

    @model_validator(mode="after")
    def one_line_per_sku(self):
        skus = [line.sku_id for line in self.items]
        if len(skus) != len(set(skus)):
            raise ValueError("each sku can appear once per delivery")
        return self


class PurchaseOrderItemOut(SchemaBase):
    id: int
    sku_id: int
    qty_ordered: int
    qty_received: int
    qty_outstanding: int
    unit_cost: Decimal | None


class PurchaseOrderOut(SchemaBase):
    id: int
    supplier_id: int
    branch_id: int
    location_id: int | None
    status: PurchaseOrderStatus
    reference: str | None
    expected_on: date | None
    created_at: datetime
    items: list[PurchaseOrderItemOut]


class PurchaseOrderListOut(SchemaBase):
    items: list[PurchaseOrderOut]
    meta: dict[str, int | None]
