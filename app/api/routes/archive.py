from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.models.entities import SKU, Category, Product, User
from app.schemas.catalog import CategoryOut
from app.schemas.product import ProductOut
from app.schemas.sku import SKUOut
from app.services import archive_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/catalog", tags=["catalog"])


class ArchiveIn(BaseModel):
    reason: str | None = Field(default=None, max_length=255)
    # Archive even with stock on hand; requires a reason.
    force: bool = False


async def _run(
    action: str,
    resource: str,
    out,
    model,
    entity_id: int,
    request: Request,
    user: User | None,
    session: AsyncSession,
    op: Callable[[], Awaitable],
):
    try:
        current = await session.get(model, entity_id)
        before = (
            out.model_validate(current).model_dump(mode="json") if current else None
        )
        entity = await op()
        await write_audit_log(
            session,
            request=request,
            user_id=user.id if user else None,
            action=f"{resource}.{action}",
            resource_type=resource,
            resource_id=entity_id,
            before=before,
            after=out.model_validate(entity).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    await session.refresh(entity)
    return out.model_validate(entity)


def _register(
    path: str, resource: str, out, model, perm: str, archive, restore
) -> None:
    """Adds POST /catalog/<path>/{id}/archive and /restore, audited."""

    @router.post(
        f"/{path}/{{entity_id}}/archive",
        response_model=out,
        dependencies=[Depends(require_permission(perm))],
        name=f"archive_{resource}",
    )
    async def archive_endpoint(
        entity_id: int,
        payload: ArchiveIn,
        request: Request,
        user: User | None = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ):
        return await _run(
            "archive",
            resource,
            out,
            model,
            entity_id,
            request,
            user,
            session,
            lambda: archive(session, entity_id, payload),
        )

    @router.post(
        f"/{path}/{{entity_id}}/restore",
        response_model=out,
        dependencies=[Depends(require_permission(perm))],
        name=f"restore_{resource}",
    )
    async def restore_endpoint(
        entity_id: int,
        request: Request,
        user: User | None = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ):
        return await _run(
            "restore",
            resource,
            out,
            model,
            entity_id,
            request,
            user,
            session,
            lambda: restore(session, entity_id),
        )


_register(
    "products",
    "product",
    ProductOut,
    Product,
    "catalog.product.update",
    lambda s, i, p: archive_service.archive_product(
        s, i, reason=p.reason, force=p.force
    ),
    archive_service.restore_product,
)
_register(
    "skus",
    "sku",
    SKUOut,
    SKU,
    "catalog.sku.update",
    lambda s, i, p: archive_service.archive_sku(s, i, reason=p.reason, force=p.force),
    archive_service.restore_sku,
)
_register(
    "categories",
    "category",
    CategoryOut,
    Category,
    "catalog.category.update",
    lambda s, i, p: archive_service.archive_category(s, i, reason=p.reason),
    archive_service.restore_category,
)
