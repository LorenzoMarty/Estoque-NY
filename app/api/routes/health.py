from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.settings import get_settings

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


async def _health_db_status(session: AsyncSession) -> dict[str, str]:
    result = await session.execute(text("SELECT 1"))
    _ = result.scalar_one()
    return {"status": "ok", "db": "up"}


@router.get("/health/db")
async def health_db(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    return await _health_db_status(session)


@router.get("/db")
async def db(session: AsyncSession = Depends(get_session)) -> dict[str, str]:
    return await _health_db_status(session)
