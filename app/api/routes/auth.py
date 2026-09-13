from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import (
    PaginationParams,
    apply_order_and_pagination,
    page_meta,
    pagination_params,
)
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.entities import Permission, Role, User, UserRole
from app.schemas.auth import (
    AssignRoleIn,
    PermissionOut,
    RefreshTokenIn,
    RoleOut,
    TokenPairOut,
    UserActiveIn,
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

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: UserRegisterIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> User:
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


@router.post("/login", response_model=TokenPairOut)
async def login_user(
    payload: UserLoginIn,
    session: AsyncSession = Depends(get_session),
) -> TokenPairOut:
    async with session.begin():
        await ensure_rbac_seed(session)
        user = await session.scalar(select(User).where(User.email == payload.email))
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="invalid credentials",
            )
        if not user.active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="inactive user",
            )

    return TokenPairOut(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenPairOut)
async def refresh_access_token(payload: RefreshTokenIn) -> TokenPairOut:
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
    return TokenPairOut(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


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
