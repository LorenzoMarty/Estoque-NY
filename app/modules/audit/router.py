from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import require_permission
from app.db.session import get_session
from app.modules.audit.service import export_audit_logs_csv, list_audit_logs_service

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
    resource_id: str | None = Query(default=None),
    branch_id: int | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
    export: str | None = Query(default=None, pattern="^csv$"),
    session: AsyncSession = Depends(get_session),
):
    """Audit trail. `export=csv` returns the same filtered rows as a file."""
    filters: dict[str, Any] = {
        "q": q,
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "branch_id": branch_id,
        "from_date": from_date,
        "to_date": to_date,
    }
    if export == "csv":
        body = await export_audit_logs_csv(session, sort=sort, order=order, **filters)
        return Response(
            content=body,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
        )
    return await list_audit_logs_service(
        session,
        page=page,
        page_size=page_size,
        sort=sort,
        order=order,
        **filters,
    )
