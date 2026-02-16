from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.middleware import request_id_middleware
from app.api.router import api_router
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
    app.middleware("http")(request_id_middleware)
    app.include_router(api_router)

    return app


app = create_app()
