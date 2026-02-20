import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.db.session import dispose_engine, get_engine
from app.main import create_app
from app.models import entities as _entities  # noqa: F401
from app.models.base import Base


@pytest_asyncio.fixture
async def client(tmp_path):
    db_file = tmp_path / "test_inventory.db"
    database_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"

    previous_env = {
        "DATABASE_URL": os.environ.get("DATABASE_URL"),
        "AUTH_ENABLED": os.environ.get("AUTH_ENABLED"),
        "JWT_SECRET": os.environ.get("JWT_SECRET"),
        "APP_ENV": os.environ.get("APP_ENV"),
    }

    os.environ["DATABASE_URL"] = database_url
    os.environ["AUTH_ENABLED"] = "true"
    os.environ["JWT_SECRET"] = "test-secret-key"
    os.environ["APP_ENV"] = "test"

    get_settings.cache_clear()
    await dispose_engine()

    engine = get_engine()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as async_client:
        yield async_client

    await dispose_engine()
    get_settings.cache_clear()

    for key, value in previous_env.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value
