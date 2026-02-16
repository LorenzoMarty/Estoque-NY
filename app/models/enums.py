from enum import StrEnum


class LocationType(StrEnum):
    STORE = "STORE"
    STOCK = "STOCK"
    DAMAGED = "DAMAGED"


class MoveType(StrEnum):
    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    ADJUSTMENT = "ADJUSTMENT"
