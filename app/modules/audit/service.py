from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import page_meta
from app.modules.audit.repository import list_audit_logs


def _serialize_log_row(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "action": row.action,
        "resource_type": row.resource_type,
        "resource_id": row.resource_id,
        "before_json": row.before_json,
        "after_json": row.after_json,
        "meta_json": row.meta_json,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


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
        from_date=from_date,
        to_date=to_date,
    )
    return {
        "items": [_serialize_log_row(row) for row in rows],
        "meta": page_meta(total=total, page=page, page_size=page_size),
    }
