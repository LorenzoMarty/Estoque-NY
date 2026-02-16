from app.models.enums import LocationType
from app.schemas.base import SchemaBase


class LocationCreate(SchemaBase):
    branch_id: int
    name: str
    type: LocationType


class LocationOut(SchemaBase):
    id: int
    branch_id: int
    name: str
    type: LocationType
