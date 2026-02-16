from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import Branch, User
from app.schemas.branch import BranchCreate, BranchOut
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
) -> Branch:
    branch = Branch(name=payload.name)
    session.add(branch)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="branch name already exists",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="branch.create",
        resource_type="branch",
        resource_id=branch.id,
        before=None,
        after={"name": branch.name},
    )
    await session.commit()
    await session.refresh(branch)
    return branch


@router.get(
    "",
    response_model=list[BranchOut],
    dependencies=[Depends(require_permission("branch.read"))],
)
async def list_branches(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("id"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    q: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Branch]:
    stmt = select(Branch)
    if q:
        stmt = stmt.where(Branch.name.ilike(f"%{q}%"))

    if sort not in {"id", "name", "created_at"}:
        sort = "id"
    column = getattr(Branch, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    result = await session.scalars(stmt)
    return list(result.all())
