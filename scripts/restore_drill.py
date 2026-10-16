#!/usr/bin/env python
"""Restore drill: dump a Postgres database, restore it into a scratch database and
compare every table's row count.

The source is only read (pg_dump). The scratch database is created on the same
server as `--source-url` (or the one in `--scratch-admin-url`), checked and dropped.
Prints a markdown row to paste into the drill log of docs/runbook-database.md.

    uv run python scripts/restore_drill.py \
        --source-url postgresql://user:pass@host:5432/inventory

pg_dump / pg_restore must be on PATH, or pass --pg-bin <dir>.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo


def _tool(name: str, pg_bin: str | None) -> str:
    if pg_bin:
        for suffix in ("", ".exe"):
            path = Path(pg_bin) / f"{name}{suffix}"
            if path.exists():
                return str(path)
    found = shutil.which(name)  # also resolves .exe on Windows
    if found:
        return found
    raise SystemExit(
        f"{name} not found: install the PostgreSQL client or pass --pg-bin"
    )


def _with_dbname(url: str, dbname: str) -> str:
    return make_conninfo(url, dbname=dbname)


def table_counts(url: str) -> dict[str, int]:
    """Row count of every base table in the public schema (alembic_version included)."""
    with psycopg.connect(url) as conn:
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
                "ORDER BY table_name"
            )
        ]
        return {
            table: conn.execute(
                sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
            ).fetchone()[0]
            for table in tables
        }


def run_drill(source_url: str, admin_url: str, pg_bin: str | None = None) -> dict:
    """Returns the drill result; raises on any step that fails."""
    pg_dump, pg_restore = _tool("pg_dump", pg_bin), _tool("pg_restore", pg_bin)
    scratch = f"restore_drill_{uuid.uuid4().hex[:8]}"
    scratch_url = _with_dbname(admin_url, scratch)

    with tempfile.TemporaryDirectory() as tmp:
        dump_file = Path(tmp) / "backup.dump"

        started = time.perf_counter()
        subprocess.run(
            [
                pg_dump,
                "--format=custom",
                "--no-owner",
                "--file",
                str(dump_file),
                source_url,
            ],
            check=True,
            capture_output=True,
        )
        dump_seconds = time.perf_counter() - started
        dump_bytes = dump_file.stat().st_size

        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(scratch)))
        try:
            started = time.perf_counter()
            subprocess.run(
                [pg_restore, "--no-owner", "--dbname", scratch_url, str(dump_file)],
                check=True,
                capture_output=True,
            )
            restore_seconds = time.perf_counter() - started
            source_counts = table_counts(source_url)
            restored_counts = table_counts(scratch_url)
        finally:
            with psycopg.connect(admin_url, autocommit=True) as admin:
                admin.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(scratch)
                    )
                )

    mismatched = {
        table: (source_counts.get(table), restored_counts.get(table))
        for table in sorted(set(source_counts) | set(restored_counts))
        if source_counts.get(table) != restored_counts.get(table)
    }
    return {
        "tables": len(source_counts),
        "rows": sum(source_counts.values()),
        "dump_bytes": dump_bytes,
        "dump_seconds": dump_seconds,
        "restore_seconds": restore_seconds,
        "mismatched": mismatched,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--source-url", required=True, help="database to back up (read-only)"
    )
    parser.add_argument(
        "--scratch-admin-url",
        help="server for the scratch database (default: the source server)",
    )
    parser.add_argument("--pg-bin", help="directory with pg_dump and pg_restore")
    args = parser.parse_args()

    result = run_drill(
        args.source_url, args.scratch_admin_url or args.source_url, args.pg_bin
    )
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    verdict = "OK" if not result["mismatched"] else "MISMATCH"
    print(
        f"| {today} | {result['tables']} tables, {result['rows']} rows | "
        f"{result['dump_bytes'] / 1024:.0f} KiB | dump {result['dump_seconds']:.1f}s, "
        f"restore {result['restore_seconds']:.1f}s | {verdict} |"
    )
    if result["mismatched"]:
        for table, (before, after) in result["mismatched"].items():
            print(f"  {table}: source={before} restored={after}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
