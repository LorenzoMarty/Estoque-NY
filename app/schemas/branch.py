from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import SchemaBase


class BranchBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BranchBase):
    pass


class BranchOut(SchemaBase):
    id: int
    name: str
    created_at: datetime


class BranchListOut(SchemaBase):
    items: list[BranchOut]
    meta: dict[str, int | None]
