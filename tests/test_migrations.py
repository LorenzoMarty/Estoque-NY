import os
import uuid

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url

# The downgrade of 678cb1a6f4bf is auto-generated (`drop_constraint(None, ...)`) and
# cannot run on SQLite or Postgres, so reversibility is checked only for the
# migrations after it. Rewrite that downgrade to extend this range.
LAST_REVERSIBLE_REVISION = "4c6c5ec2d9a1"

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")


def _alembic_config() -> Config:
    return Config("alembic.ini")


def _head() -> str | None:
    return ScriptDirectory.from_config(_alembic_config()).get_current_head()


def _sync_url(url: str) -> str:
    parsed = make_url(url)
    driver = "sqlite" if parsed.get_backend_name() == "sqlite" else "postgresql+psycopg"
    return parsed.set(drivername=driver).render_as_string(hide_password=False)


@pytest.fixture(params=["sqlite", "postgres"])
def migration_url(request, tmp_path):
    """URL of an empty database, created and dropped per test."""
    if request.param == "sqlite":
        yield f"sqlite+aiosqlite:///{(tmp_path / 'migrated.db').as_posix()}"
        return

    if not TEST_DATABASE_URL.startswith("postgres"):
        pytest.skip("TEST_DATABASE_URL does not point to Postgres")

    base = make_url(TEST_DATABASE_URL)
    scratch = f"migrations_{uuid.uuid4().hex[:10]}"
    admin = sa.create_engine(
        _sync_url(base.set(database="postgres").render_as_string(hide_password=False)),
        isolation_level="AUTOCOMMIT",
    )
    with admin.connect() as connection:
        connection.execute(sa.text(f'CREATE DATABASE "{scratch}"'))
    try:
        yield base.set(database=scratch).render_as_string(hide_password=False)
    finally:
        with admin.connect() as connection:
            connection.execute(sa.text(f'DROP DATABASE "{scratch}" WITH (FORCE)'))
        admin.dispose()


def _inspect(url: str) -> tuple[set[str], str | None]:
    engine = sa.create_engine(_sync_url(url))
    try:
        with engine.connect() as connection:
            tables = set(sa.inspect(connection).get_table_names())
            version = connection.execute(
                sa.text("SELECT version_num FROM alembic_version")
            ).scalar()
    finally:
        engine.dispose()
    return tables, version


def test_migrations_have_a_single_head():
    heads = ScriptDirectory.from_config(_alembic_config()).get_heads()
    assert len(heads) == 1


def test_upgrade_head_from_scratch(migration_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", migration_url)

    command.upgrade(_alembic_config(), "head")

    tables, version = _inspect(migration_url)
    assert {"skus", "stock_balances", "stock_moves", "transfer_orders"} <= tables
    assert version == _head()


def test_recent_migrations_can_be_downgraded_and_reapplied(migration_url, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", migration_url)
    config = _alembic_config()

    command.upgrade(config, "head")
    command.downgrade(config, LAST_REVERSIBLE_REVISION)
    assert _inspect(migration_url)[1] == LAST_REVERSIBLE_REVISION

    command.upgrade(config, "head")
    assert _inspect(migration_url)[1] == _head()
