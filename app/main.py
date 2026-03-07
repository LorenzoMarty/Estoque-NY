from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import request_context_middleware
from app.core.settings import get_settings
from app.db.session import dispose_engine, get_engine


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    get_engine()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    cors_origins = [origin.strip() for origin in settings.cors_origins.split(",")]
    cors_origins = [origin for origin in cors_origins if origin]
    allow_origin_regex = None
    if "*" in cors_origins:
        # With credentials enabled, using "*" in allow_origins may lead to
        # browser-side CORS rejection on cross-origin requests.
        cors_origins = []
        allow_origin_regex = ".*"

    app = FastAPI(
        title=settings.app_name,
        lifespan=app_lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(request_context_middleware)
    register_exception_handlers(app)
    app.include_router(api_router)
    # Vercel may forward requests with or without the `/api` prefix depending on
    # the function entrypoint that matches the request.
    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
