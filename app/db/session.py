from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine

    if _engine is None:
        settings = get_settings()
        engine_kwargs: dict = {
            "future": True,
            "pool_pre_ping": True,
        }
        if settings.database_url.startswith("sqlite+"):
            engine_kwargs["connect_args"] = {"check_same_thread": False}

        _engine = create_async_engine(settings.database_url, **engine_kwargs)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _sessionmaker

    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
        )
    return _sessionmaker


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session


async def dispose_engine() -> None:
    global _engine, _sessionmaker

    if _engine is not None:
        await _engine.dispose()
        _engine = None
    _sessionmaker = None
