from datetime import datetime

from pydantic import Field

from app.schemas.base import SchemaBase


class CategoryCreate(SchemaBase):
    name: str = Field(min_length=1, max_length=120)


class CategoryOut(SchemaBase):
    id: int
    name: str
    created_at: datetime


class BrandCreate(SchemaBase):
    name: str = Field(min_length=1, max_length=120)


class BrandOut(SchemaBase):
    id: int
    name: str
    created_at: datetime
