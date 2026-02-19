import asyncio

from sqlalchemy.ext.asyncio import create_async_engine

from app.core.settings import get_settings

settings = get_settings()


async def main():
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.exec_driver_sql("SELECT 1;")
    await engine.dispose()
    print("DB OK")


if __name__ == "__main__":
    asyncio.run(main())
