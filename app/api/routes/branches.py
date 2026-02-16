from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.entities import Branch
from app.schemas.branch import BranchCreate, BranchOut

router = APIRouter(prefix="/branches", tags=["branches"])


@router.post("", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
async def create_branch(
    payload: BranchCreate,
    session: AsyncSession = Depends(get_session),
) -> Branch:
    branch = Branch(name=payload.name)
    session.add(branch)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="branch name already exists",
        ) from exc

    await session.refresh(branch)
    return branch


@router.get("", response_model=list[BranchOut])
async def list_branches(session: AsyncSession = Depends(get_session)) -> list[Branch]:
    result = await session.scalars(select(Branch).order_by(Branch.id))
    return list(result.all())
