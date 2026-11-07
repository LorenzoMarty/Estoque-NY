from datetime import datetime

from app.models.enums import TransferStatus
from app.schemas.base import SchemaBase


class TransferItemIn(SchemaBase):
    sku_id: int
    qty: int


class TransferCreateIn(SchemaBase):
    from_branch_id: int
    from_location_id: int
    to_branch_id: int
    to_location_id: int
    items: list[TransferItemIn]
    note: str | None = None


class TransferReceiveItemIn(SchemaBase):
    sku_id: int
    received_qty: int


class TransferReceiveIn(SchemaBase):
    """Omit the body to receive everything that was shipped."""

    items: list[TransferReceiveItemIn] = []
    reason: str | None = None


class TransferItemOut(SchemaBase):
    id: int
    transfer_id: int
    sku_id: int
    qty: int
    received_qty: int | None = None


class TransferOut(SchemaBase):
    id: int
    from_branch_id: int
    from_location_id: int
    to_branch_id: int
    to_location_id: int
    status: TransferStatus
    note: str | None
    created_by: int | None
    created_at: datetime
    shipped_at: datetime | None
    received_at: datetime | None
    discrepancy_reason: str | None = None
    items: list[TransferItemOut] = []


class TransferListOut(SchemaBase):
    items: list[TransferOut]
    meta: dict[str, int | None]
