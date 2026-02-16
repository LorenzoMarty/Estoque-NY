from datetime import datetime

from pydantic import Field

from app.models.enums import MoveType
from app.schemas.base import SchemaBase


class StockAdjustmentIn(SchemaBase):
    branch_id: int
    sku_id: int
    qty_delta: int
    location_id: int | None = None
    reason: str | None = None
    reference_id: str | None = None
    occurred_at: datetime | None = None


class StockReceiptIn(SchemaBase):
    branch_id: int
    sku_id: int
    qty: int = Field(..., gt=0)
    location_id: int | None = None
    reason: str | None = None
    reference_id: str | None = None
    occurred_at: datetime | None = None


class StockIssueIn(SchemaBase):
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
    on_hand: int
    updated_at: datetime
