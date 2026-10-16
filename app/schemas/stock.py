from datetime import datetime

from pydantic import Field, field_validator

from app.models.enums import MoveType
from app.schemas.base import SchemaBase


class _MoveInBase(SchemaBase):
    """Optional text fields arrive as "" from forms; "" is not "no value".

    `reference_id` is unique per move type, so a stored "" would make the second
    movement without a reference fail with a conflict.
    """

    @field_validator("reason", "reference_id", mode="before", check_fields=False)
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value.strip() if isinstance(value, str) else value


class StockAdjustmentIn(_MoveInBase):
    branch_id: int
    sku_id: int
    qty_delta: int
    location_id: int | None = None
    reason: str | None = None
    reference_id: str | None = None
    occurred_at: datetime | None = None


class StockReceiptIn(_MoveInBase):
    branch_id: int
    sku_id: int
    qty: int = Field(..., gt=0)
    location_id: int | None = None
    reason: str | None = None
    reference_id: str | None = None
    occurred_at: datetime | None = None


class StockIssueIn(_MoveInBase):
    branch_id: int
    sku_id: int
    qty: int = Field(..., gt=0)
    location_id: int | None = None
    reason: str | None = None
    reference_id: str | None = None
    occurred_at: datetime | None = None


class StockMoveOut(SchemaBase):
    id: int
    branch_id: int
    sku_id: int
    location_id: int | None
    transfer_id: int | None = None
    inventory_count_id: int | None = None
    created_by: int | None = None
    move_type: MoveType
    qty: int
    occurred_at: datetime
    created_at: datetime
    reason: str | None
    reference_id: str | None
    balance_after: int


class StockBalanceOut(SchemaBase):
    id: int
    branch_id: int
    sku_id: int
    location_id: int | None
    on_hand: int
    updated_at: datetime


class StockBalanceListOut(SchemaBase):
    items: list[StockBalanceOut]
    meta: dict[str, int | None]


class StockMoveListOut(SchemaBase):
    items: list[StockMoveOut]
    meta: dict[str, int | None]
