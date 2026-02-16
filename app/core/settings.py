from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Ambiente
    app_env: str = "local"
    app_name: str = "inventory-api"
    log_level: str = "INFO"

    # Segurança
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 30
    jwt_refresh_expiration_minutes: int = 1440
    auth_enabled: bool = True

    # Banco de dados
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:55432/inventory"
    )

    # Estoque / API
    allow_negative_stock: bool = False
    idempotency_required_in_production: bool = True

    # CORS
    cors_origins: str = "*"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
