from dataclasses import dataclass
from math import ceil
from typing import Any

from fastapi import Query
from sqlalchemy import Select


@dataclass
class PaginationParams:
    page: int = 1
    page_size: int = 50
    sort: str = "created_at"
    order: str = "desc"
    q: str | None = None


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
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
) -> Select[Any]:
    sort_field = params.sort if params.sort in allowed_sort_fields else "created_at"
    column = getattr(model, sort_field, None)
    if column is not None:
        if params.order == "asc":
            stmt = stmt.order_by(column.asc())
        else:
            stmt = stmt.order_by(column.desc())
    return stmt.limit(params.page_size).offset((params.page - 1) * params.page_size)


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
