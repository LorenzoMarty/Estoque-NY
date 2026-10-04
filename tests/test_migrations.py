import sqlite3

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory


def _alembic_config() -> Config:
    return Config("alembic.ini")


def test_migrations_have_a_single_head():
    heads = ScriptDirectory.from_config(_alembic_config()).get_heads()
    assert len(heads) == 1


def test_upgrade_head_from_scratch_on_sqlite(tmp_path, monkeypatch):
    db_file = tmp_path / "migrated.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{db_file.as_posix()}")

    command.upgrade(_alembic_config(), "head")

    with sqlite3.connect(db_file) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        revision = connection.execute("SELECT version_num FROM alembic_version")
        version = revision.fetchone()[0]

    assert {"skus", "stock_balances", "stock_moves", "transfer_orders"} <= tables
    assert version == ScriptDirectory.from_config(_alembic_config()).get_current_head()
