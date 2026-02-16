from __future__ import annotations

from typing import Any, TypedDict


class PageMeta(TypedDict, total=False):
    page: int
    page_size: int
    total: int
    next: int | None
    prev: int | None


class PaginatedResponse(TypedDict, total=False):
    items: list[dict[str, Any]]
    meta: PageMeta
