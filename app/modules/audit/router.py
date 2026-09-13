from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import require_permission
from app.db.session import get_session
from app.modules.audit.service import list_audit_logs_service

router = APIRouter(
    prefix="/admin",
    tags=["audit"],
)


@router.get(
    "/audit-logs",
    dependencies=[Depends(require_permission("audit.read"))],
)
async def list_audit_logs(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await list_audit_logs_service(
        session,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        q=q,
    )
