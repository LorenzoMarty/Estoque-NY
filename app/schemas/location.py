from pydantic import Field, field_validator

from app.models.enums import LocationType
from app.schemas.base import SchemaBase


class LocationBase(SchemaBase):
    branch_id: int
    name: str = Field(min_length=1, max_length=120)
    type: LocationType

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized


class LocationCreate(LocationBase):
    pass


class LocationUpdate(LocationBase):
    pass


class LocationOut(SchemaBase):
    id: int
    branch_id: int
    name: str
    type: LocationType


class LocationListOut(SchemaBase):
    items: list[LocationOut]
    meta: dict[str, int | None]
