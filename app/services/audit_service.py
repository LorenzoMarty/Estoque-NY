from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import AuditLog


def _request_meta(request: Request) -> dict[str, Any]:
    return {
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
        "request_id": getattr(request.state, "request_id", None),
    }


def _branch_of(
    explicit: int | None, resource_type: str, resource_id: Any, before: Any, after: Any
) -> int | None:
    """The branch an audited action touched: explicit, itself, or a payload field."""
    if explicit is not None:
        return explicit
    if resource_type == "branch" and str(resource_id).isdigit():
        return int(resource_id)
    for payload in (after, before):
        value = payload.get("branch_id") if isinstance(payload, dict) else None
        if isinstance(value, int):
            return value
    return None


async def write_audit_log(
    session: AsyncSession,
    *,
    request: Request,
    user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: int | str | None,
    before: Any = None,
    after: Any = None,
    branch_id: int | None = None,
) -> None:
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            branch_id=_branch_of(branch_id, resource_type, resource_id, before, after),
            before_json=jsonable_encoder(before) if before is not None else None,
            after_json=jsonable_encoder(after) if after is not None else None,
            meta_json=_request_meta(request),
        )
    )
