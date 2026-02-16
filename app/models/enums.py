from enum import Enum


class LocationType(str, Enum):
    STORE = "STORE"
    STOCK = "STOCK"
    DAMAGED = "DAMAGED"


class MoveType(str, Enum):
    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    ADJUSTMENT = "ADJUSTMENT"
