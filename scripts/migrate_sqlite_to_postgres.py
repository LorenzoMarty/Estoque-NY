#!/usr/bin/env python
"""One-shot migration script: SQLite -> PostgreSQL.

Usage example:
    python scripts/migrate_sqlite_to_postgres.py --sqlite-path ./inventory.db
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.engine import Connection, Engine

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

TABLE_COPY_ORDER = [
    # Dimensional and auth master data
    "branches",
    "locations",
    "categories",
    "brands",
    "products",
    "skus",
    "sku_barcodes",
    "roles",
    "permissions",
    "users",
    "role_permissions",
    "user_roles",
    # Inventory and transactional data
    "stock_balances",
    "transfer_orders",
    "transfer_order_items",
    "inventory_counts",
    "inventory_count_lines",
    "stock_moves",
    "audit_logs",
    "idempotency_keys",
]

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quote_identifier(identifier: str) -> str:
    if not IDENTIFIER_PATTERN.match(identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier}")
    return f'"{identifier}"'


def _to_sync_postgres_url(database_url: str) -> str:
    lowered = database_url.lower()
    if lowered.startswith("postgres://"):
        return "postgresql+psycopg://" + database_url[len("postgres://") :]
    if lowered.startswith("postgresql://"):
        return "postgresql+psycopg://" + database_url[len("postgresql://") :]
    if lowered.startswith("postgresql+asyncpg://"):
        return "postgresql+psycopg://" + database_url[len("postgresql+asyncpg://") :]
    if lowered.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + database_url[len("postgresql+psycopg2://") :]
    if lowered.startswith("postgresql+psycopg://"):
        return database_url
    raise ValueError(
        "DATABASE_URL must point to PostgreSQL. " f"Received: {database_url}"
    )


def _to_sqlite_url(sqlite_path: str) -> str:
    resolved_path = Path(sqlite_path).resolve()
    if not resolved_path.exists():
        raise FileNotFoundError(f"SQLite file not found: {resolved_path}")
    return f"sqlite:///{resolved_path.as_posix()}"


def _run_alembic_upgrade(postgres_async_url: str) -> None:
    previous_database_url = os.getenv("DATABASE_URL")
    os.environ["DATABASE_URL"] = postgres_async_url
    try:
        cfg = Config("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", postgres_async_url.replace("%", "%%"))
        command.upgrade(cfg, "head")
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url


def _has_any_data(connection: Connection, table_names: list[str]) -> bool:
    for table_name in table_names:
        quoted = _quote_identifier(table_name)
        row = connection.execute(text(f"SELECT 1 FROM {quoted} LIMIT 1")).first()
        if row is not None:
            return True
    return False


def _truncate_target(connection: Connection, table_names: list[str]) -> None:
    if not table_names:
        return
    quoted = ", ".join(_quote_identifier(name) for name in table_names)
    connection.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))


def _copy_table_data(
    source_connection: Connection,
    target_connection: Connection,
    source_table: sa.Table,
    target_table: sa.Table,
    batch_size: int,
) -> int:
    copied = 0
    result = source_connection.execute(sa.select(source_table))

    while True:
        rows = result.mappings().fetchmany(batch_size)
        if not rows:
            break
        payload = [dict(row) for row in rows]
        target_connection.execute(target_table.insert(), payload)
        copied += len(payload)

    return copied


def _reset_postgres_sequence(connection: Connection, table_name: str) -> None:
    quoted = _quote_identifier(table_name)
    serial_target = f'"{table_name}"'
    sequence_name = connection.execute(
        text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
        {"table_name": serial_target},
    ).scalar_one_or_none()

    if not sequence_name:
        return

    max_id = connection.execute(text(f"SELECT MAX(id) FROM {quoted}")).scalar_one()
    if max_id is None:
        connection.execute(
            text("SELECT setval(:sequence_name::regclass, 1, false)"),
            {"sequence_name": sequence_name},
        )
        return

    connection.execute(
        text("SELECT setval(:sequence_name::regclass, :max_id, true)"),
        {"sequence_name": sequence_name, "max_id": int(max_id)},
    )


def _reflect_tables(engine: Engine) -> MetaData:
    metadata = MetaData()
    metadata.reflect(bind=engine)
    return metadata


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate SQLite data to PostgreSQL.")
    parser.add_argument(
        "--sqlite-path",
        default="./inventory.db",
        help="Path to the SQLite file (default: ./inventory.db).",
    )
    parser.add_argument(
        "--sqlite-url",
        default="",
        help="Optional full SQLite URL. Overrides --sqlite-path.",
    )
    parser.add_argument(
        "--postgres-url",
        default="",
        help="Optional PostgreSQL URL. Defaults to DATABASE_URL from environment.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Batch size for INSERT operations (default: 500).",
    )
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="Skip 'alembic upgrade head' before copying data.",
    )
    parser.add_argument(
        "--truncate-target",
        action="store_true",
        help="Truncate destination tables before copying data.",
    )
    return parser.parse_args()


def _resolve_urls(args: argparse.Namespace) -> tuple[str, str]:
    from app.core.config import _normalize_database_url
    from app.core.settings import get_settings

    settings = get_settings()
    source_sqlite_url = args.sqlite_url.strip() or _to_sqlite_url(args.sqlite_path)
    destination_async_url = (
        args.postgres_url.strip()
        or os.getenv("DATABASE_URL", "").strip()
        or settings.database_url
    )
    destination_async_url = _normalize_database_url(
        database_url=destination_async_url,
        sqlite_url=settings.sqlite_url,
    )
    destination_sync_url = _to_sync_postgres_url(destination_async_url)
    return source_sqlite_url, destination_sync_url


def main() -> None:
    args = _parse_args()
    source_url, target_url = _resolve_urls(args)
    target_async_url = target_url.replace(
        "postgresql+psycopg://", "postgresql+asyncpg://"
    )

    if not args.skip_migrations:
        print("Running Alembic migrations on destination...")
        _run_alembic_upgrade(target_async_url)

    source_engine = create_engine(source_url, future=True)
    target_engine = create_engine(target_url, future=True)

    try:
        source_metadata = _reflect_tables(source_engine)
        target_metadata = _reflect_tables(target_engine)

        tables_to_copy = [
            table_name
            for table_name in TABLE_COPY_ORDER
            if table_name in source_metadata.tables
            and table_name in target_metadata.tables
        ]
        if not tables_to_copy:
            raise RuntimeError(
                "No overlapping tables found between source SQLite "
                "and destination PostgreSQL."
            )

        with (
            source_engine.connect() as source_connection,
            target_engine.begin() as target_connection,
        ):
            if (
                _has_any_data(target_connection, tables_to_copy)
                and not args.truncate_target
            ):
                raise RuntimeError(
                    "Destination already has data. "
                    "Use --truncate-target to run a destructive migration."
                )
            if args.truncate_target:
                print("Truncating destination tables...")
                _truncate_target(target_connection, list(reversed(tables_to_copy)))

            copied_by_table: dict[str, int] = {}
            for table_name in tables_to_copy:
                source_table = source_metadata.tables[table_name]
                target_table = target_metadata.tables[table_name]
                copied = _copy_table_data(
                    source_connection=source_connection,
                    target_connection=target_connection,
                    source_table=source_table,
                    target_table=target_table,
                    batch_size=args.batch_size,
                )
                copied_by_table[table_name] = copied
                if "id" in target_table.columns:
                    _reset_postgres_sequence(target_connection, table_name)

        print("Migration finished successfully.")
        for table_name in tables_to_copy:
            print(f"  - {table_name}: {copied_by_table.get(table_name, 0)} rows")

    finally:
        source_engine.dispose()
        target_engine.dispose()


if __name__ == "__main__":
    main()
