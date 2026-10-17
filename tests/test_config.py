import pytest
from pydantic import ValidationError

from app.core.config import Settings

PROD = {
    "app_env": "production",
    "jwt_secret": "a-real-secret",
    "database_url": "postgresql://user:pass@db.example.com/inventory",
    "_env_file": None,
}


def test_production_accepts_explicit_cors_origins():
    settings = Settings(
        **PROD, cors_origins="https://a.example.com, https://b.example.com"
    )
    assert settings.cors_origins.startswith("https://a.example.com")


@pytest.mark.parametrize("origins", ["*", "https://a.example.com,*", "", " , "])
def test_production_rejects_wildcard_or_empty_cors(origins):
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(**PROD, cors_origins=origins)


def test_local_env_keeps_wildcard_cors():
    settings = Settings(app_env="local", cors_origins="*", _env_file=None)
    assert settings.cors_origins == "*"


@pytest.mark.parametrize("secret", ["change-me", ""])
def test_production_rejects_default_or_empty_jwt_secret(secret):
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(**{**PROD, "jwt_secret": secret}, cors_origins="https://a.example.com")


@pytest.mark.parametrize(
    "origin", ["https://a.example.com/", "a.example.com", "ftp://a.example.com"]
)
def test_production_rejects_origins_a_browser_would_never_send(origin):
    with pytest.raises(ValidationError, match="CORS_ORIGINS entry"):
        Settings(**PROD, cors_origins=origin)
