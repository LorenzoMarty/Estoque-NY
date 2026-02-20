from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import SchemaBase


class CategoryBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(SchemaBase):
    id: int
    name: str
    created_at: datetime


class BrandBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("name cannot be empty")
        return normalized


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BrandBase):
    pass


class BrandOut(SchemaBase):
    id: int
    name: str
    created_at: datetime


class BrandListOut(SchemaBase):
    items: list[BrandOut]
    meta: dict[str, int | None]
