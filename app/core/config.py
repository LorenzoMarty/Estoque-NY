from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PRODUCTION_ENVS = {"prod", "production"}


def _normalize_database_url(database_url: str | None, sqlite_url: str) -> str:
    raw_url = (database_url or "").strip()
    if not raw_url:
        return sqlite_url

    lowered = raw_url.lower()
    if lowered.startswith("postgres://"):
        return "postgresql+asyncpg://" + raw_url[len("postgres://") :]
    if lowered.startswith("postgresql://"):
        return "postgresql+asyncpg://" + raw_url[len("postgresql://") :]
    if lowered.startswith("postgresql+psycopg://"):
        return "postgresql+asyncpg://" + raw_url[len("postgresql+psycopg://") :]
    if lowered.startswith("postgresql+psycopg2://"):
        return "postgresql+asyncpg://" + raw_url[len("postgresql+psycopg2://") :]
    return raw_url


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "inventory-api"
    log_level: str = "INFO"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 30
    jwt_refresh_expiration_minutes: int = 1440
    auth_enabled: bool = True

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:55432/inventory"
    )
    sqlite_url: str = "sqlite+aiosqlite:///./inventory.db"

    allow_negative_stock: bool = False
    idempotency_required_in_production: bool = True

    cors_origins: str = "*"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def normalize_database_url(self) -> "Settings":
        self.database_url = _normalize_database_url(
            database_url=self.database_url,
            sqlite_url=self.sqlite_url,
        )
        normalized_env = self.app_env.strip().lower()
        normalized_database_url = self.database_url.strip().lower()

        if normalized_env in _PRODUCTION_ENVS:
            if not self.jwt_secret or self.jwt_secret == "change-me":
                raise ValueError("JWT_SECRET must be configured for production")
            if not normalized_database_url:
                raise ValueError("DATABASE_URL must be configured for production")
            if normalized_database_url.startswith("sqlite+"):
                raise ValueError(
                    "DATABASE_URL must point to PostgreSQL in production, not SQLite"
                )
            if (
                "localhost" in normalized_database_url
                or "127.0.0.1" in normalized_database_url
            ):
                raise ValueError(
                    "DATABASE_URL cannot point to localhost in production"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
