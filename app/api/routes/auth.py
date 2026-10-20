from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import (
    PaginationParams,
    apply_order_and_pagination,
    page_meta,
    pagination_params,
)
from app.api.security import get_current_user, require_permission
from app.core.auth import token_predates_password_change
from app.core.branch_scope import load_branch_scope
from app.core.db import get_session
from app.core.password_policy import describe, password_problems
from app.core.role_matrix import BRANCH_ROLES
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.core.settings import get_settings
from app.domain.errors import BusinessRuleError
from app.models.entities import Branch, Permission, Role, User, UserBranch, UserRole
from app.schemas.auth import (
    AssignRoleIn,
    ChangePasswordIn,
    PermissionOut,
    RefreshTokenIn,
    RoleOut,
    TokenPairOut,
    UserActiveIn,
    UserBranchesIn,
    UserBranchesOut,
    UserListOut,
    UserLoginIn,
    UserOut,
    UserRegisterIn,
    UserWithRolesOut,
)
from app.services.audit_service import write_audit_log
from app.services.auth_service import (
    ADMIN_ROLE,
    OPERATOR_ROLE,
    assign_role_to_user,
    ensure_rbac_seed,
    is_first_user,
)
from app.services.refresh_tokens import (
    consume_token,
    find_token,
    issue_refresh_token,
    revoke_family,
    revoke_user_tokens,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: UserRegisterIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
    problems = password_problems(payload.password, email=payload.email)
    if problems:
        raise BusinessRuleError(describe(problems))

    async with session.begin():
        await ensure_rbac_seed(session)

        existing = await session.scalar(
            select(User.id).where(User.email == payload.email)
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="email already registered",
            )

        first_user = await is_first_user(session)
        user = User(
            name=payload.name,
            email=payload.email,
            password_hash=hash_password(payload.password),
            active=True,
        )
        session.add(user)
        await session.flush()

        await assign_role_to_user(
            session,
            user_id=user.id,
            role_name=ADMIN_ROLE if first_user else OPERATOR_ROLE,
        )
        await write_audit_log(
            session,
            request=request,
            user_id=user.id,
            action="auth.register",
            resource_type="user",
            resource_id=user.id,
            before=None,
            after={"id": user.id, "email": user.email},
        )
        await session.flush()
        await session.refresh(user)

    return user


async def _record_failed_login(session: AsyncSession, user_id: int) -> None:
    """Count one failure atomically (concurrent attempts cannot undercount) and lock
    the account when the limit is reached.

    Accepted trade-off: the lock is per account, so someone who knows an e-mail can lock
    that person out for `login_lockout_minutes` with a few wrong passwords (an admin
    included). The per-IP rate limit on /auth/login (separate PR) bounds how fast.
    """
    settings = get_settings()
    attempts = await session.scalar(
        update(User)
        .where(User.id == user_id)
        .values(failed_login_attempts=User.failed_login_attempts + 1)
        .returning(User.failed_login_attempts)
    )
    if attempts is not None and attempts >= settings.login_max_failed_attempts:
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(
                failed_login_attempts=0,
                locked_until=datetime.now(UTC)
                + timedelta(minutes=settings.login_lockout_minutes),
            )
        )


def _as_utc(value: datetime) -> datetime:
    # SQLite drops the time zone of stored datetimes; treat naive values as UTC.
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


@router.post("/login", response_model=TokenPairOut)
async def login_user(
    payload: UserLoginIn,
    session: AsyncSession = Depends(get_session),
) -> TokenPairOut:
    now = datetime.now(UTC)
    retry_after = 0
    # The failure counter must be committed even though the request ends in an
    # error, so decide inside the transaction and raise after it closes.
    async with session.begin():
        await ensure_rbac_seed(session)
        user = await session.scalar(select(User).where(User.email == payload.email))
        if (
            user is not None
            and user.locked_until is not None
            and _as_utc(user.locked_until) > now
        ):
            outcome = "locked"
            retry_after = int((_as_utc(user.locked_until) - now).total_seconds()) + 1
        elif user is None or not verify_password(payload.password, user.password_hash):
            outcome = "invalid"
            if user is not None:
                await _record_failed_login(session, user.id)
        elif not user.active:
            outcome = "inactive"
        else:
            outcome = "ok"
            user.failed_login_attempts = 0
            user.locked_until = None

    if outcome == "locked":
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="account temporarily locked after repeated failed logins",
            headers={"Retry-After": str(retry_after)},
        )
    if outcome == "invalid":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    if outcome == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="inactive user",
        )

    assert user is not None
    refresh_token = issue_refresh_token(session, user.id)
    await session.commit()
    return TokenPairOut(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
    )


@router.post("/change-password", response_model=TokenPairOut)
async def change_password(
    payload: ChangePasswordIn,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TokenPairOut:
    """Change the password and return a fresh token pair.

    Every token issued before this call stops working, so a stolen session ends
    here. A wrong current password counts toward the same lockout as a failed login.
    """
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    if not verify_password(payload.current_password, current_user.password_hash):
        await _record_failed_login(session, current_user.id)
        await session.commit()  # keep the count even though the request fails
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="current password is incorrect",
        )
    problems = password_problems(payload.new_password, email=current_user.email)
    if payload.new_password == payload.current_password:
        problems.append("different from the current password")
    if problems:
        raise BusinessRuleError(describe(problems))

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_change_password = False
    current_user.failed_login_attempts = 0
    current_user.locked_until = None
    current_user.password_changed_at = datetime.now(UTC)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id,
        action="auth.password.change",
        resource_type="user",
        resource_id=current_user.id,
        before=None,
        after=None,
    )
    await revoke_user_tokens(session, current_user.id)
    refresh_token = issue_refresh_token(session, current_user.id)
    await session.commit()
    return TokenPairOut(
        access_token=create_access_token(current_user.id),
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=TokenPairOut)
async def refresh_access_token(
    payload: RefreshTokenIn,
    session: AsyncSession = Depends(get_session),
) -> TokenPairOut:
    try:
        token_payload = decode_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid refresh token",
        ) from exc

    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token type",
        )

    sub = token_payload.get("sub")
    if sub is None or not str(sub).isdigit():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token subject",
        )
    user_id = int(sub)
    user = await session.scalar(select(User).where(User.id == user_id))
    if (
        user is None
        or not user.active
        or token_predates_password_change(token_payload, user)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session no longer valid; sign in again",
        )
    jti = token_payload.get("jti")
    family_id = None
    if jti is not None:  # tokens issued before rotation existed carry no jti
        row = await find_token(session, str(jti))
        if row is None or row.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session no longer valid; sign in again",
            )
        if row.revoked_at is not None or not await consume_token(session, row.jti):
            # A rotated/revoked token came back: assume theft, end the whole family.
            await revoke_family(session, row.family_id)
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="refresh token already used; sign in again",
            )
        family_id = row.family_id
    refresh_token = issue_refresh_token(session, user_id, family_id)
    await session.commit()
    return TokenPairOut(
        access_token=create_access_token(user_id),
        refresh_token=refresh_token,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    payload: RefreshTokenIn,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Revoke the refresh token's whole family. Idempotent: bad tokens are a no-op."""
    try:
        jti = decode_token(payload.refresh_token).get("jti")
    except ValueError:
        return
    row = await find_token(session, str(jti)) if jti is not None else None
    if row is not None:
        await revoke_family(session, row.family_id)
        await session.commit()


@router.get("/me", response_model=UserOut)
async def read_me(current_user: User | None = Depends(get_current_user)) -> User:
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )
    return current_user


@router.post(
    "/roles/assign",
    dependencies=[Depends(require_permission("auth.user.manage"))],
    status_code=status.HTTP_204_NO_CONTENT,
)
async def assign_role(
    payload: AssignRoleIn,
    request: Request,
    actor: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        await ensure_rbac_seed(session)
        user = await session.scalar(select(User).where(User.id == payload.user_id))
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"user {payload.user_id} not found",
            )
        try:
            await assign_role_to_user(
                session,
                user_id=payload.user_id,
                role_name=payload.role_name,
                replace_existing=True,
            )
        except IntegrityError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="role assignment conflict",
            ) from exc
        await write_audit_log(
            session,
            request=request,
            user_id=actor.id if actor else None,
            action="auth.role.assign",
            resource_type="user",
            resource_id=user.id,
            before=None,
            after={"role": payload.role_name},
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise


@router.get(
    "/users",
    response_model=UserListOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def list_users(
    params: PaginationParams = Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> UserListOut:
    stmt = select(User)
    if params.q:
        stmt = stmt.where(
            (User.name.ilike(f"%{params.q}%")) | (User.email.ilike(f"%{params.q}%"))
        )

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=User,
        params=params,
        allowed_sort_fields={"id", "name", "email", "created_at"},
    )
    rows = (await session.scalars(stmt)).all()

    user_ids = [row.id for row in rows]
    roles_by_user: dict[int, list[str]] = {user_id: [] for user_id in user_ids}
    if user_ids:
        role_rows = (
            await session.execute(
                select(UserRole.user_id, Role.name)
                .join(Role, Role.id == UserRole.role_id)
                .where(UserRole.user_id.in_(user_ids))
            )
        ).all()
        for user_id, role_name in role_rows:
            roles_by_user.setdefault(user_id, []).append(role_name)

    items = [
        UserWithRolesOut(
            id=row.id,
            name=row.name,
            email=row.email,
            active=row.active,
            must_change_password=row.must_change_password,
            created_at=row.created_at,
            roles=roles_by_user.get(row.id, []),
        )
        for row in rows
    ]
    return UserListOut(
        items=items,
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/roles",
    response_model=list[RoleOut],
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def list_roles(session: AsyncSession = Depends(get_session)) -> list[Role]:
    await ensure_rbac_seed(session)
    await session.commit()
    rows = (await session.scalars(select(Role).order_by(Role.name))).all()
    return list(rows)


@router.get(
    "/permissions",
    response_model=list[PermissionOut],
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def list_permissions(
    session: AsyncSession = Depends(get_session),
) -> list[Permission]:
    await ensure_rbac_seed(session)
    await session.commit()
    rows = (await session.scalars(select(Permission).order_by(Permission.key))).all()
    return list(rows)


@router.patch(
    "/users/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def update_user_active(
    user_id: int,
    payload: UserActiveIn,
    request: Request,
    actor: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    if actor is not None and actor.id == user_id and not payload.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot deactivate your own account",
        )

    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"user {user_id} not found",
        )

    before = {"active": user.active}
    user.active = payload.active
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=actor.id if actor else None,
        action="auth.user.update_active",
        resource_type="user",
        resource_id=user.id,
        before=before,
        after={"active": user.active},
    )
    await session.commit()
    await session.refresh(user)
    return user


@router.post(
    "/users/{user_id}/force-password-change",
    response_model=UserOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def force_password_change(
    user_id: int,
    request: Request,
    actor: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"user {user_id} not found",
        )
    before = {"must_change_password": user.must_change_password}
    user.must_change_password = True
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=actor.id if actor else None,
        action="auth.user.force_password_change",
        resource_type="user",
        resource_id=user.id,
        before=before,
        after={"must_change_password": True},
    )
    await session.commit()
    await session.refresh(user)
    return user


async def _user_branches_out(session: AsyncSession, user: User) -> UserBranchesOut:
    rows = (
        await session.execute(
            select(UserBranch.branch_id, Role.name)
            .join(Role, Role.id == UserBranch.role_id, isouter=True)
            .where(UserBranch.user_id == user.id)
            .order_by(UserBranch.branch_id)
        )
    ).all()
    scope = await load_branch_scope(session, user)
    return UserBranchesOut(
        user_id=user.id,
        branch_ids=[branch_id for branch_id, _ in rows],
        roles={branch_id: name for branch_id, name in rows if name is not None},
        unrestricted=scope.unrestricted,
    )


@router.get(
    "/users/{user_id}/branches",
    response_model=UserBranchesOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def read_user_branches(
    user_id: int,
    session: AsyncSession = Depends(get_session),
) -> UserBranchesOut:
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"user {user_id} not found",
        )
    return await _user_branches_out(session, user)


@router.put(
    "/users/{user_id}/branches",
    response_model=UserBranchesOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def replace_user_branches(
    user_id: int,
    payload: UserBranchesIn,
    request: Request,
    actor: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserBranchesOut:
    user = await session.scalar(
        select(User).where(User.id == user_id).with_for_update()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"user {user_id} not found",
        )
    wanted = set(payload.branch_ids)
    existing = set(
        (await session.scalars(select(Branch.id).where(Branch.id.in_(wanted)))).all()
    )
    if existing != wanted:
        raise BusinessRuleError(f"unknown branch ids: {sorted(wanted - existing)}")

    stray = sorted(set(payload.roles) - wanted)
    if stray:
        raise BusinessRuleError(f"roles given for branches not assigned: {stray}")
    bad_roles = sorted(set(payload.roles.values()) - set(BRANCH_ROLES))
    if bad_roles:
        raise BusinessRuleError(
            f"unknown branch roles {bad_roles}; allowed: {list(BRANCH_ROLES)}"
        )
    await ensure_rbac_seed(session)
    role_ids = {
        name: role_id
        for name, role_id in (
            await session.execute(
                select(Role.name, Role.id).where(
                    Role.name.in_(set(payload.roles.values()))
                )
            )
        ).all()
    }

    before = (
        await session.scalars(
            select(UserBranch.branch_id).where(UserBranch.user_id == user_id)
        )
    ).all()
    await session.execute(delete(UserBranch).where(UserBranch.user_id == user_id))
    for branch_id in sorted(wanted):
        role_name = payload.roles.get(branch_id)
        session.add(
            UserBranch(
                user_id=user_id,
                branch_id=branch_id,
                role_id=role_ids[role_name] if role_name else None,
            )
        )
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=actor.id if actor else None,
        action="auth.user.branches.replace",
        resource_type="user",
        resource_id=user_id,
        before={"branch_ids": sorted(before)},
        after={"branch_ids": sorted(wanted), "roles": payload.roles},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="branches of this user were changed at the same time; retry",
        ) from exc
    return await _user_branches_out(session, user)
