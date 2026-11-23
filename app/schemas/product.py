from datetime import datetime
from typing import Annotated
from urllib.parse import urlparse

from pydantic import AfterValidator, Field

from app.schemas.base import SchemaBase


def _validate_image_url(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("image_url must be an http(s) URL")
    return value


ImageUrl = Annotated[
    str | None, Field(max_length=500), AfterValidator(_validate_image_url)
]


def _clean_collections(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    tags = [tag.strip().lower() for tag in value if tag.strip()]
    return sorted(set(tags))


Collections = Annotated[
    list[Annotated[str, Field(max_length=40)]] | None,
    Field(max_length=20),
    AfterValidator(_clean_collections),
]


class ProductCreate(SchemaBase):
    name: str
    description: str | None = None
    category_id: int | None = None
    brand_id: int | None = None
    brand: str | None = None
    active: bool = True
    featured: bool = False
    is_new: bool = False
    collections: Collections = None
    published: bool = False
    image_url: ImageUrl = None


class ProductUpdate(SchemaBase):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    brand_id: int | None = None
    brand: str | None = None
    active: bool | None = None
    featured: bool | None = None
    is_new: bool | None = None
    collections: Collections = None
    published: bool | None = None
    image_url: ImageUrl = None


class ProductOut(SchemaBase):
    id: int
    name: str
    description: str | None
    category_id: int | None
    brand_id: int | None
    brand: str | None
    active: bool
    featured: bool
    is_new: bool
    collections: list[str] | None
    published: bool
    image_url: str | None
    created_at: datetime
    archived_at: datetime | None
    archive_reason: str | None


class ProductListOut(SchemaBase):
    items: list[ProductOut]
    meta: dict[str, int | None]
