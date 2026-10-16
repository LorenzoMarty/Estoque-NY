"""Which branches the signed-in user may see and change.

Admins (and requests with auth disabled) are unrestricted. Everyone else is
limited to the rows of `user_branches`; a user with no rows sees nothing.
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.db.session import get_session
from app.models.entities import Role, User, UserBranch, UserRole

ADMIN_ROLE = "admin"


@dataclass(frozen=True)
class BranchScope:
    ids: frozenset[int] | None  # None = unrestricted

    @property
    def unrestricted(self) -> bool:
        return self.ids is None

    def allows(self, branch_id: int) -> bool:
        return self.ids is None or branch_id in self.ids

    def require(self, branch_id: int) -> None:
        if not self.allows(branch_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"no access to branch {branch_id}",
            )

    def apply(self, stmt: Select, column, requested: int | None = None) -> Select:
        """Narrow a query to the branches this user may see.

        With an explicit `requested` branch the user must be allowed to use it;
        without one, restricted users get only their own branches.
        """
        if requested is not None:
            self.require(requested)
            return stmt.where(column == requested)
        if self.ids is None:
            return stmt
        return stmt.where(column.in_(self.ids))


async def load_branch_scope(session: AsyncSession, user: User | None) -> BranchScope:
    if user is None:
        return BranchScope(None)
    is_admin = await session.scalar(
        select(UserRole.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id == user.id, Role.name == ADMIN_ROLE)
        .limit(1)
    )
    if is_admin is not None:
        return BranchScope(None)
    rows = await session.scalars(
        select(UserBranch.branch_id).where(UserBranch.user_id == user.id)
    )
    return BranchScope(frozenset(rows.all()))


async def get_branch_scope(
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BranchScope:
    return await load_branch_scope(session, user)
