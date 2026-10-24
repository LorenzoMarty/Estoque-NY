from dataclasses import dataclass
from math import ceil
from typing import Any

from fastapi import Query
from sqlalchemy import Select, inspect

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 50


@dataclass
class PaginationParams:
    page: int = 1
    page_size: int = 50
    sort: str = "created_at"
    order: str = "desc"
    q: str | None = None


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
) -> PaginationParams:
    return PaginationParams(
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        q=q,
    )


def apply_order_and_pagination(
    stmt: Select[Any],
    *,
    model: type[Any],
    params: PaginationParams,
    allowed_sort_fields: set[str],
    default_sort: str = "created_at",
) -> Select[Any]:
    sort_field = params.sort if params.sort in allowed_sort_fields else default_sort
    column = getattr(model, sort_field, None)
    if column is not None:
        stmt = stmt.order_by(column.asc() if params.order == "asc" else column.desc())
    # Primary key as tie-breaker (or sole order) keeps pages stable and non-overlapping.
    return (
        stmt.order_by(*inspect(model).primary_key)
        .limit(params.page_size)
        .offset((params.page - 1) * params.page_size)
    )


def page_meta(*, total: int, page: int, page_size: int) -> dict[str, int | None]:
    total_pages = ceil(total / page_size) if total else 1
    next_page = page + 1 if page < total_pages else None
    prev_page = page - 1 if page > 1 else None
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "next": next_page,
        "prev": prev_page,
    }
