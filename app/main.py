from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.db import dispose_engine, get_engine
from app.core.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    get_engine()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        lifespan=app_lifespan,
    )

    @app.get("/health")
    async def health():
        return {"status": "ok", "env": settings.app_env}

    return app


app = create_app()
