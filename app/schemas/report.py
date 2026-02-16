from decimal import Decimal

from app.schemas.base import SchemaBase


class PaginatedMeta(SchemaBase):
    page: int
    page_size: int
    total: int
    next: int | None
    prev: int | None


class StockValuationRow(SchemaBase):
    branch_id: int
    location_id: int | None
    sku_id: int
    on_hand: int
    cost: Decimal
    valuation: Decimal


class StockTurnoverRow(SchemaBase):
    branch_id: int
    location_id: int | None
    sku_id: int
    issued_qty: int
    average_stock: float
    turnover: float


class StockABCRow(SchemaBase):
    sku_id: int
    movement_value: Decimal
    cumulative_percent: float
    class_name: str
