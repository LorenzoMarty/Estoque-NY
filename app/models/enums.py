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
