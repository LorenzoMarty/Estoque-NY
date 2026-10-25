from enum import StrEnum


class LocationType(StrEnum):
    STORE = "STORE"
    STOCK = "STOCK"
    DAMAGED = "DAMAGED"


class MoveType(StrEnum):
    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    ADJUSTMENT = "ADJUSTMENT"
    TRANSFER_SHIP = "TRANSFER_SHIP"
    TRANSFER_RECEIVE = "TRANSFER_RECEIVE"


class StockReason(StrEnum):
    """Why stock left outside a sale; the shrinkage report groups by it (#29)."""

    BREAKAGE = "BREAKAGE"
    THEFT = "THEFT"
    EXPIRY = "EXPIRY"
    DAMAGE = "DAMAGE"
    SAMPLE = "SAMPLE"
    COUNT_CORRECTION = "COUNT_CORRECTION"
    OTHER = "OTHER"


class TransferStatus(StrEnum):
    DRAFT = "DRAFT"
    SHIPPED = "SHIPPED"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"


class InventoryCountStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class UOM(StrEnum):
    UN = "UN"
    KG = "KG"
    CX = "CX"


class MarketingChannelType(StrEnum):
    EMAIL = "EMAIL"
    SOCIAL = "SOCIAL"
    PAID_MEDIA = "PAID_MEDIA"
    MARKETPLACE = "MARKETPLACE"
    STORE = "STORE"
    OTHER = "OTHER"


class CampaignStatus(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"


class PromotionStatus(StrEnum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"


class DiscountType(StrEnum):
    PERCENT = "PERCENT"
    FIXED = "FIXED"
    CUSTOM = "CUSTOM"
