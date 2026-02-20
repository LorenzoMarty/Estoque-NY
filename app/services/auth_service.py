from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import ALL_PERMISSIONS
from app.models.entities import Permission, Role, RolePermission, User, UserRole

ADMIN_ROLE = "admin"
OPERATOR_ROLE = "stock_operator"
VIEWER_ROLE = "viewer"


async def ensure_rbac_seed(session: AsyncSession) -> None:
    existing_permissions = {
        key
        for key in (
            await session.scalars(
                select(Permission.key).where(Permission.key.in_(ALL_PERMISSIONS))
            )
        ).all()
    }
    for key in ALL_PERMISSIONS:
        if key not in existing_permissions:
            session.add(Permission(key=key))
    await session.flush()

    role_names = {ADMIN_ROLE, OPERATOR_ROLE, VIEWER_ROLE}
    existing_roles = {
        name
        for name in (
            await session.scalars(select(Role.name).where(Role.name.in_(role_names)))
        ).all()
    }
    for name in role_names - existing_roles:
        session.add(Role(name=name))
    await session.flush()

    roles = {
        role.name: role
        for role in (
            await session.scalars(select(Role).where(Role.name.in_(role_names)))
        ).all()
    }
    permissions = {
        permission.key: permission
        for permission in (await session.scalars(select(Permission))).all()
    }

    admin_role = roles[ADMIN_ROLE]
    operator_role = roles[OPERATOR_ROLE]
    viewer_role = roles[VIEWER_ROLE]

    admin_perm_ids = {permissions[key].id for key in ALL_PERMISSIONS}
    operator_perm_keys = {
        key
        for key in ALL_PERMISSIONS
        if key.startswith("stock.")
        or key.startswith("product.")
        or key.startswith("sku.")
        or key in {"branch.read", "location.read", "category.read", "brand.read"}
    }
    operator_perm_ids = {permissions[key].id for key in operator_perm_keys}
    viewer_perm_keys = {
        key for key in ALL_PERMISSIONS if key.endswith(".read") or key == "reports.read"
    }
    viewer_perm_ids = {permissions[key].id for key in viewer_perm_keys}

    await _sync_role_permissions(session, admin_role.id, admin_perm_ids)
    await _sync_role_permissions(session, operator_role.id, operator_perm_ids)
    await _sync_role_permissions(session, viewer_role.id, viewer_perm_ids)


async def _sync_role_permissions(
    session: AsyncSession,
    role_id: int,
    expected_permission_ids: set[int],
) -> None:
    existing = {
        permission_id
        for permission_id in (
            await session.scalars(
                select(RolePermission.permission_id).where(
                    RolePermission.role_id == role_id
                )
            )
        ).all()
    }
    for permission_id in expected_permission_ids - existing:
        session.add(RolePermission(role_id=role_id, permission_id=permission_id))
    if existing - expected_permission_ids:
        await session.execute(
            delete(RolePermission).where(
                RolePermission.role_id == role_id,
                RolePermission.permission_id.in_(existing - expected_permission_ids),
            )
        )


async def assign_role_to_user(
    session: AsyncSession,
    *,
    user_id: int,
    role_name: str,
    replace_existing: bool = False,
) -> None:
    role = await session.scalar(select(Role).where(Role.name == role_name))
    if role is None:
        return

    if replace_existing:
        await session.execute(delete(UserRole).where(UserRole.user_id == user_id))

    exists = await session.scalar(
        select(UserRole.id).where(
            UserRole.user_id == user_id, UserRole.role_id == role.id
        )
    )
    if exists is None:
        session.add(UserRole(user_id=user_id, role_id=role.id))


async def is_first_user(session: AsyncSession) -> bool:
    count_users = await session.scalar(select(func.count()).select_from(User))
    return (count_users or 0) == 0
