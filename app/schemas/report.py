from datetime import datetime
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


class CampaignProductRow(SchemaBase):
    campaign_id: int
    product_id: int
    product_name: str
    on_hand: int


class PromotionSKURow(SchemaBase):
    promotion_id: int
    sku_id: int
    sku_code: str
    cost: Decimal
    price: Decimal


class CampaignRow(SchemaBase):
    id: int
    name: str
    status: str
    channel_id: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    budget: Decimal | None


class LowTurnoverCandidateRow(SchemaBase):
    branch_id: int
    location_id: int | None
    sku_id: int
    issued_qty: int
    average_stock: float
    turnover: float


class TopSKUByValueRow(SchemaBase):
    sku_id: int
    movement_value: Decimal


class MarketingDashboardSummary(SchemaBase):
    stock_valuation_total: Decimal
    active_campaigns_count: int
    active_promotions_count: int
    low_turnover_candidates_count: int
    top_skus_by_value: list[TopSKUByValueRow]
