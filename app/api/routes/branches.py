from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.pagination import page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.models.entities import User
from app.schemas.branch import BranchCreate, BranchListOut, BranchOut, BranchUpdate
from app.services import admin_entities_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/branches", tags=["branches"])


@router.post(
    "",
    response_model=BranchOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("branch.create"))],
)
async def create_branch(
    payload: BranchCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BranchOut:
    try:
        branch = await admin_entities_service.create_branch(session, payload=payload)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="branch.create",
            resource_type="branch",
            resource_id=branch.id,
            before=None,
            after=BranchOut.model_validate(branch).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(branch)
    return BranchOut.model_validate(branch)


@router.get(
    "",
    response_model=BranchListOut,
    dependencies=[Depends(require_permission("branch.read"))],
)
async def list_branches(
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> BranchListOut:
    rows, total = await admin_entities_service.list_branches(
        session,
        page=params.page,
        page_size=params.page_size,
        sort=params.sort,
        order=params.order,
        q=params.q,
    )
    return BranchListOut(
        items=[BranchOut.model_validate(row) for row in rows],
        meta=page_meta(
            total=int(total),
            page=params.page,
            page_size=params.page_size,
        ),
    )


@router.get(
    "/{branch_id}",
    response_model=BranchOut,
    dependencies=[Depends(require_permission("branch.read"))],
)
async def get_branch(
    branch_id: int,
    session: AsyncSession = Depends(get_session),
) -> BranchOut:
    try:
        branch = await admin_entities_service.get_branch_or_error(
            session,
            branch_id=branch_id,
        )
    except DomainError as exc:
        raise domain_error_to_http(exc) from exc
    return BranchOut.model_validate(branch)


@router.put(
    "/{branch_id}",
    response_model=BranchOut,
    dependencies=[Depends(require_permission("branch.update"))],
)
async def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BranchOut:
    try:
        current = await admin_entities_service.get_branch_or_error(
            session,
            branch_id=branch_id,
        )
        before = BranchOut.model_validate(current).model_dump(mode="json")
        branch = await admin_entities_service.update_branch(
            session,
            branch_id=branch_id,
            payload=payload,
        )
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="branch.update",
            resource_type="branch",
            resource_id=branch.id,
            before=before,
            after=BranchOut.model_validate(branch).model_dump(mode="json"),
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(branch)
    return BranchOut.model_validate(branch)


@router.delete(
    "/{branch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("branch.delete"))],
)
async def delete_branch(
    branch_id: int,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        current = await admin_entities_service.get_branch_or_error(
            session,
            branch_id=branch_id,
        )
        before = BranchOut.model_validate(current).model_dump(mode="json")
        await admin_entities_service.delete_branch(session, branch_id=branch_id)
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="branch.delete",
            resource_type="branch",
            resource_id=branch_id,
            before=before,
            after=None,
        )
        await session.commit()
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise
