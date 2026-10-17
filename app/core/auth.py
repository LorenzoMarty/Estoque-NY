from collections.abc import Callable
from datetime import UTC
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.core.settings import get_settings
from app.db.session import get_session
from app.models.entities import (
    Permission,
    RolePermission,
    User,
    UserBranch,
    UserRole,
)

bearer_scheme = HTTPBearer(auto_error=False)


def token_predates_password_change(payload: dict[str, Any], user: User) -> bool:
    """True when the token was issued before the user's last password change."""
    changed = user.password_changed_at
    if changed is None:
        return False
    if changed.tzinfo is None:  # SQLite drops the time zone
        changed = changed.replace(tzinfo=UTC)
    return int(payload.get("iat", 0)) < int(changed.timestamp())


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    settings = get_settings()
    if not settings.auth_enabled:
        return None

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )

    try:
        payload = decode_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from exc

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token type",
        )

    sub = payload.get("sub")
    if sub is None or not str(sub).isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token subject",
        )

    user = await session.scalar(select(User).where(User.id == int(sub)))
    if user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user not found or inactive",
        )
    if token_predates_password_change(payload, user):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session ended by a password change; sign in again",
        )

    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    settings = get_settings()
    if not settings.auth_enabled:
        return None

    if credentials is None:
        return None

    try:
        payload = decode_token(credentials.credentials)
    except ValueError:
        return None

    sub = payload.get("sub")
    if sub is None or not str(sub).isdigit():
        return None

    return await session.scalar(select(User).where(User.id == int(sub)))


async def _has_permission(
    session: AsyncSession,
    user_id: int,
    permission_key: str,
) -> bool:
    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id, Permission.key == permission_key)
        .limit(1)
    )
    permission_id = await session.scalar(stmt)
    return permission_id is not None


async def _has_branch_role_permission(
    session: AsyncSession,
    user_id: int,
    permission_key: str,
) -> bool:
    """True if a role the user holds in some branch grants the permission."""
    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserBranch, UserBranch.role_id == RolePermission.role_id)
        .where(UserBranch.user_id == user_id, Permission.key == permission_key)
        .limit(1)
    )
    return await session.scalar(stmt) is not None


def require_permission(
    permission_key: str, *, branch_scoped: bool = False
) -> Callable[..., Any]:
    async def dependency(
        request: Request,
        session: AsyncSession = Depends(get_session),
        user: User | None = Depends(get_current_user),
    ) -> User | None:
        settings = get_settings()
        # Read by BranchScope to judge the same permission per branch.
        request.state.permission_key = permission_key
        if not settings.auth_enabled:
            return user

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="authentication required",
            )

        if user.must_change_password:
            # /auth/me and /auth/change-password only need get_current_user, so
            # they stay reachable; everything guarded by a permission does not.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="password change required",
            )

        # Global roles grant it everywhere. A role held in one branch only counts on
        # endpoints that then judge each branch (branch_scoped=True); on global
        # endpoints (catalog, marketing, audit) it must not become a global permission.
        allowed = await _has_permission(session, user.id, permission_key)
        if not allowed and branch_scoped:
            allowed = await _has_branch_role_permission(
                session, user.id, permission_key
            )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"missing permission: {permission_key}",
            )

        request.state.user_id = user.id
        return user

    return dependency
