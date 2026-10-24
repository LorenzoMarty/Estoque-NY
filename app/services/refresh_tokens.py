"""Server-side record of refresh tokens: rotation, revocation and reuse detection."""

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import uuid4

from sqlalchemy import CursorResult, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_refresh_token
from app.core.settings import get_settings
from app.models.entities import RefreshToken


def issue_refresh_token(
    session: AsyncSession, user_id: int, family_id: str | None = None
) -> str:
    """Create a refresh token and stage its row; the caller commits."""
    jti = uuid4().hex
    session.add(
        RefreshToken(
            jti=jti,
            family_id=family_id or uuid4().hex,
            user_id=user_id,
            expires_at=datetime.now(UTC)
            + timedelta(minutes=get_settings().jwt_refresh_expiration_minutes),
        )
    )
    return create_refresh_token(user_id, jti=jti)


async def revoke_user_tokens(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def revoke_family(session: AsyncSession, family_id: str) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def find_token(session: AsyncSession, jti: str) -> RefreshToken | None:
    return await session.scalar(select(RefreshToken).where(RefreshToken.jti == jti))


async def consume_token(session: AsyncSession, jti: str) -> bool:
    """Atomically revoke an unrevoked token; False if someone else got there first."""
    result = await session.execute(
        update(RefreshToken)
        .where(RefreshToken.jti == jti, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    return cast(CursorResult[Any], result).rowcount == 1
