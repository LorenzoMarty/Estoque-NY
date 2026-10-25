from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuditLog

ALLOWED_SORT_FIELDS = {"id", "created_at", "user_id", "action", "resource_type"}


def _filtered(
    *,
    q: str | None,
    user_id: int | None,
    action: str | None,
    resource_type: str | None,
    resource_id: str | None,
    branch_id: int | None,
    from_date: datetime | None,
    to_date: datetime | None,
) -> Select[Any]:
    """The one place filters live: the list and the CSV export both use it."""
    stmt = select(AuditLog)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type.ilike(f"%{resource_type}%"))
    if resource_id:
        stmt = stmt.where(AuditLog.resource_id == resource_id)
    if branch_id is not None:
        stmt = stmt.where(AuditLog.branch_id == branch_id)
    if from_date is not None:
        stmt = stmt.where(AuditLog.created_at >= from_date)
    if to_date is not None:
        stmt = stmt.where(AuditLog.created_at <= to_date)
    if q:
        stmt = stmt.where(
            or_(
                AuditLog.action.ilike(f"%{q}%"),
                AuditLog.resource_type.ilike(f"%{q}%"),
                AuditLog.resource_id.ilike(f"%{q}%"),
            )
        )
    return stmt


async def list_audit_logs(
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
) -> tuple[int, list[AuditLog]]:
    stmt = _filtered(
        q=q,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date,
    )

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    if sort not in ALLOWED_SORT_FIELDS:
        sort = "created_at"
    column = getattr(AuditLog, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    rows = list((await session.scalars(stmt)).all())
    return int(total), rows
