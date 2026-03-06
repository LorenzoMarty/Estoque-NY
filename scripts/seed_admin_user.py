#!/usr/bin/env python
"""Seed a default admin user in the configured database."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or update a default admin user"
    )
    parser.add_argument("--name", default="Administrador", help="Admin display name.")
    parser.add_argument(
        "--email",
        default="admin@estoque.local",
        help="Admin login email.",
    )
    parser.add_argument(
        "--password",
        default="Admin123!",
        help="Admin password (change it after first login).",
    )
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset password if the user already exists.",
    )
    return parser.parse_args()


async def _seed_admin(args: argparse.Namespace) -> None:
    from app.core.security import hash_password
    from app.db.session import dispose_engine, get_sessionmaker
    from app.models.entities import User
    from app.services.auth_service import (
        ADMIN_ROLE,
        assign_role_to_user,
        ensure_rbac_seed,
    )

    email = str(args.email or "").strip().lower()
    if "@" not in email:
        raise ValueError(f"Invalid admin email: {args.email}")
    password = str(args.password or "")
    if len(password) < 8:
        raise ValueError("Admin password must have at least 8 characters.")

    sessionmaker = get_sessionmaker()
    created = False
    password_reset = False
    user_id = 0

    async with sessionmaker() as session:
        async with session.begin():
            await ensure_rbac_seed(session)
            user = await session.scalar(select(User).where(User.email == email))

            if user is None:
                user = User(
                    name=str(args.name or "Administrador").strip() or "Administrador",
                    email=email,
                    password_hash=hash_password(password),
                    active=True,
                )
                session.add(user)
                await session.flush()
                created = True
            else:
                if not user.active:
                    user.active = True
                if args.reset_password:
                    user.password_hash = hash_password(password)
                    password_reset = True
                if args.name:
                    user.name = str(args.name).strip() or user.name

            await assign_role_to_user(
                session,
                user_id=user.id,
                role_name=ADMIN_ROLE,
                replace_existing=False,
            )
            await session.flush()
            user_id = user.id

    await dispose_engine()

    print(f"admin_user_id={user_id}")
    print(f"admin_email={email}")
    if created:
        print("result=created")
        print(f"admin_password={password}")
    elif password_reset:
        print("result=updated_password")
        print(f"admin_password={password}")
    else:
        print("result=already_exists")


def main() -> None:
    args = _parse_args()
    asyncio.run(_seed_admin(args))


if __name__ == "__main__":
    main()
