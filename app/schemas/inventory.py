from datetime import datetime

from app.models.enums import InventoryCountStatus
from app.schemas.base import SchemaBase


class InventoryCountCreateIn(SchemaBase):
    branch_id: int
    location_id: int
    scope: str = "ALL"
    sku_ids: list[int] | None = None


class InventoryCountLinePatchIn(SchemaBase):
    sku_id: int
    counted_qty: int


class InventoryCountPatchLinesIn(SchemaBase):
    lines: list[InventoryCountLinePatchIn]


class InventoryCountLineOut(SchemaBase):
    id: int
    count_id: int
    sku_id: int
    system_qty: int
    counted_qty: int | None
    diff_qty: int
    posted: bool


class InventoryCountOut(SchemaBase):
    id: int
    branch_id: int
    location_id: int
    status: InventoryCountStatus
    started_at: datetime
    closed_at: datetime | None
    posted_at: datetime | None
    cancelled_at: datetime | None
    created_by: int | None
    lines: list[InventoryCountLineOut] = []


class InventoryCountListOut(SchemaBase):
    items: list[InventoryCountOut]
    meta: dict[str, int | None]
