import csv
import json
from datetime import datetime
from io import StringIO
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import page_meta
from app.modules.audit.repository import list_audit_logs

# One export never returns more than this many rows; narrow the filters for more.
EXPORT_LIMIT = 10_000


class ExportTooLargeError(Exception):
    def __init__(self, total: int):
        super().__init__(
            f"{total} rows match, the export limit is {EXPORT_LIMIT}; "
            "narrow the filters (dates, branch, user) and try again"
        )


CSV_COLUMNS = [
    "id",
    "created_at",
    "user_id",
    "action",
    "resource_type",
    "resource_id",
    "branch_id",
    "before",
    "after",
    "ip",
    "request_id",
]


def _serialize_log_row(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "branch_id": row.branch_id,
        "before_json": row.before_json,
        "after_json": row.after_json,
        "meta_json": row.meta_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _safe_cell(value: Any) -> Any:
    """Stop spreadsheets from running a cell that starts like a formula."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _csv_row(row) -> dict[str, Any]:
    meta = row.meta_json or {}
    cells = {
        "id": row.id,
        "created_at": row.created_at.isoformat() if row.created_at else "",
        "user_id": row.user_id,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "branch_id": row.branch_id,
        "before": json.dumps(row.before_json, ensure_ascii=False, default=str)
        if row.before_json is not None
        else "",
        "after": json.dumps(row.after_json, ensure_ascii=False, default=str)
        if row.after_json is not None
        else "",
        "ip": meta.get("ip"),
        "request_id": meta.get("request_id"),
    }
    return {key: _safe_cell(value) for key, value in cells.items()}


async def list_audit_logs_service(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    sort: str,
    order: str,
    q: str | None = None,
    user_id: int | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    branch_id: int | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> dict[str, Any]:
    total, rows = await list_audit_logs(
        session,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        q=q,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
    )
    return {
        "items": [_serialize_log_row(row) for row in rows],
        "meta": page_meta(total=total, page=page, page_size=page_size),
    }


async def export_audit_logs_csv(
    session: AsyncSession,
    *,
    sort: str,
    order: str,
    **filters: Any,
) -> str:
    """Every row matching the same filters as the list.

    Refuses (413) above EXPORT_LIMIT rather than hand over a silently partial file.
    """
    total, rows = await list_audit_logs(
        session, page=1, page_size=EXPORT_LIMIT, sort=sort, order=order, **filters
    )
    if total > EXPORT_LIMIT:
        raise ExportTooLargeError(total)
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    writer.writerows(_csv_row(row) for row in rows)
    return buffer.getvalue()
