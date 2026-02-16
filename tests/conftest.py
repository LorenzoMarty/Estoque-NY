from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.settings import get_settings
from app.main import create_app
from app.models import Base


@pytest_asyncio.fixture
async def db_engine() -> AsyncIterator[AsyncEngine]:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as exc:
        await engine.dispose()
        pytest.exit(
            "Database is not reachable for tests. "
            f"DATABASE_URL={settings.database_url}. "
            "Run `docker compose up -d` and `uv run alembic upgrade head` first. "
            f"Original error: {exc}",
            returncode=1,
        )

    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def truncate_tables(db_engine: AsyncEngine) -> AsyncIterator[None]:
    table_names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)

    if table_names:
        async with db_engine.begin() as conn:
            await conn.execute(
                text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE")
            )

    yield

    if table_names:
        async with db_engine.begin() as conn:
            await conn.execute(
                text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE")
            )


@pytest.fixture
def app():
    return create_app()


@pytest_asyncio.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    register_response = await client.post(
        "/auth/register",
        json={
            "name": "Admin",
            "email": "admin@example.com",
            "password": "supersecret123",
        },
    )
    assert register_response.status_code in {201, 409}

    login_response = await client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "supersecret123"},
    )
    assert login_response.status_code == 200
    access_token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {access_token}"}
