"""Which branches the signed-in user may see and change, and with which role.

Admins (and requests with auth disabled) are unrestricted. Everyone else is
limited to the rows of `user_branches`; a user with no rows sees nothing.

A `user_branches` row may carry a role. In that branch the role *replaces* the
user's global roles: its permissions are what counts. Without a role the global
roles apply, as before. See docs/roles-matrix.md.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import _has_permission, get_current_user
from app.db.session import get_session
from app.models.entities import (
    Permission,
    Role,
    RolePermission,
    User,
    UserBranch,
    UserRole,
)

ADMIN_ROLE = "admin"


@dataclass(frozen=True)
class BranchScope:
    ids: frozenset[int] | None  # None = unrestricted
    # branch id -> permission keys of the role held in that branch
    roles: Mapping[int, frozenset[str]] = field(default_factory=dict)
    # permission of the endpoint being served, and whether the global roles grant it
    permission: str | None = None
    global_grants: bool = True

    @property
    def unrestricted(self) -> bool:
        return self.ids is None

    def allows(self, branch_id: int) -> bool:
        if self.ids is None:
            return True
        if branch_id not in self.ids:
            return False
        if self.permission is None:
            return True
        branch_permissions = self.roles.get(branch_id)
        if branch_permissions is not None:
            return self.permission in branch_permissions
        return self.global_grants

    def require(self, branch_id: int) -> None:
        if self.allows(branch_id):
            return
        if self.ids is not None and branch_id in self.ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"your role in branch {branch_id} does not allow {self.permission}"
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"no access to branch {branch_id}",
        )

    @property
    def visible_ids(self) -> frozenset[int] | None:
        """Branches usable for the current endpoint; None = all."""
        if self.ids is None:
            return None
        return frozenset(b for b in self.ids if self.allows(b))

    def apply(self, stmt: Select, column, requested: int | None = None) -> Select:
        """Narrow a query to the branches this user may use here.

        With an explicit `requested` branch the user must be allowed to use it;
        without one, restricted users get only the branches they can use.
        """
        if requested is not None:
            self.require(requested)
            return stmt.where(column == requested)
        visible = self.visible_ids
        if visible is None:
            return stmt
        return stmt.where(column.in_(visible))


async def load_branch_scope(
    session: AsyncSession, user: User | None, permission: str | None = None
) -> BranchScope:
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

    if permission is None:
        # Fail closed: a branch check with no permission context could ignore the
        # role held in the branch (e.g. let an auditor write). Admins returned above.
        return BranchScope(frozenset())

    rows = (
        await session.execute(
            select(UserBranch.branch_id, UserBranch.role_id).where(
                UserBranch.user_id == user.id
            )
        )
    ).all()
    role_ids = {role_id for _, role_id in rows if role_id is not None}
    permissions_by_role: dict[int, set[str]] = {role_id: set() for role_id in role_ids}
    if role_ids:
        for role_id, key in (
            await session.execute(
                select(RolePermission.role_id, Permission.key)
                .join(Permission, Permission.id == RolePermission.permission_id)
                .where(RolePermission.role_id.in_(role_ids))
            )
        ).all():
            permissions_by_role[role_id].add(key)

    return BranchScope(
        ids=frozenset(branch_id for branch_id, _ in rows),
        roles={
            branch_id: frozenset(permissions_by_role[role_id])
            for branch_id, role_id in rows
            if role_id is not None
        },
        permission=permission,
        global_grants=(
            await _has_permission(session, user.id, permission) if permission else True
        ),
    )


async def get_branch_scope(
    request: Request,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BranchScope:
    # `require_permission` on the route (resolved first) records which permission
    # this request needs, so each branch can be judged against it.
    permission = getattr(request.state, "permission_key", None)
    return await load_branch_scope(session, user, permission)
