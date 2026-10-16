"""The restore drill against a real Postgres (needs TEST_DATABASE_URL and pg_dump)."""

import importlib.util
import os
import shutil
import uuid
from pathlib import Path

import psycopg
import pytest

URL = os.environ.get("TEST_DATABASE_URL", "")
PG_BIN = os.environ.get("PG_BIN")

pytestmark = pytest.mark.skipif(
    not URL.startswith("postgres")
    or not (shutil.which("pg_dump") or (PG_BIN and Path(PG_BIN).exists())),
    reason="needs a Postgres TEST_DATABASE_URL and pg_dump (set PG_BIN if not on PATH)",
)


def _load_drill():
    spec = importlib.util.spec_from_file_location(
        "restore_drill", Path(__file__).parents[1] / "scripts" / "restore_drill.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def source_db():
    """A scratch source database with two tables and known contents."""
    sync_url = URL.replace("+asyncpg", "").replace("+psycopg", "")
    name = f"drill_src_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(sync_url, autocommit=True) as admin:
        admin.execute(f'CREATE DATABASE "{name}"')
    source = psycopg.conninfo.make_conninfo(sync_url, dbname=name)
    with psycopg.connect(source, autocommit=True) as conn:
        conn.execute("CREATE TABLE items (id serial PRIMARY KEY, name text)")
        conn.execute("CREATE TABLE empty_one (id int)")
        conn.execute(
            "INSERT INTO items (name) SELECT 'row ' || g FROM generate_series(1, 25) g"
        )
    yield source, sync_url
    with psycopg.connect(sync_url, autocommit=True) as admin:
        admin.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


def test_drill_restores_a_dump_and_the_counts_match(source_db):
    source, admin_url = source_db
    drill = _load_drill()

    result = drill.run_drill(source, admin_url, PG_BIN)

    assert result["mismatched"] == {}
    assert result["tables"] == 2
    assert result["rows"] == 25
    assert result["dump_bytes"] > 0


def test_drill_leaves_no_scratch_database_behind(source_db):
    source, admin_url = source_db
    drill = _load_drill()

    drill.run_drill(source, admin_url, PG_BIN)

    with psycopg.connect(admin_url) as conn:
        leftovers = conn.execute(
            "SELECT datname FROM pg_database WHERE datname LIKE 'restore_drill_%'"
        ).fetchall()
    assert leftovers == []


def test_table_counts_lists_every_table(source_db):
    source, _ = source_db

    assert _load_drill().table_counts(source) == {"empty_one": 0, "items": 25}
