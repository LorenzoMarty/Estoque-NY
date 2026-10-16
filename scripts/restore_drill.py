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
import os
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
from psycopg.conninfo import conninfo_to_dict, make_conninfo


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


def _counts(conn: psycopg.Connection) -> dict[str, int]:
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


def table_counts(url: str) -> dict[str, int]:
    """Row count of every base table in the public schema (alembic_version included)."""
    with psycopg.connect(url) as conn:
        return _counts(conn)


def _pg_args(url: str) -> tuple[list[str], dict[str, str]]:
    """Connection flags and environment for pg_dump/pg_restore, so the password is
    never on the command line (visible in `ps`) or in a traceback."""
    info = conninfo_to_dict(url)
    flags: list[str] = []
    for flag, key in (("-h", "host"), ("-p", "port"), ("-U", "user")):
        if info.get(key):
            flags += [flag, str(info[key])]
    env = {"PGPASSWORD": str(info["password"])} if info.get("password") else {}
    return flags, env


def _run(command: list[str], env: dict[str, str], what: str) -> str:
    """Run a client tool; on failure raise with its own stderr (no URL, no password)."""
    result = subprocess.run(
        command, capture_output=True, text=True, env={**os.environ, **env}
    )
    if result.returncode != 0:
        tail = "\n".join(result.stderr.strip().splitlines()[-8:])
        raise RuntimeError(f"{what} failed (exit {result.returncode}):\n{tail}")
    return result.stderr


def run_drill(
    source_url: str,
    admin_url: str,
    pg_bin: str | None = None,
    ignore_restore_errors: bool = False,
) -> dict:
    """Returns the drill result; raises on any step that fails.

    The dump and the source row counts are taken from the same exported snapshot, so
    writes happening on a live source during the drill cannot cause a false mismatch.
    """
    pg_dump, pg_restore = _tool("pg_dump", pg_bin), _tool("pg_restore", pg_bin)
    scratch = f"restore_drill_{uuid.uuid4().hex[:8]}"
    scratch_url = _with_dbname(admin_url, scratch)
    src_flags, src_env = _pg_args(source_url)
    scr_flags, scr_env = _pg_args(scratch_url)
    source_db = conninfo_to_dict(source_url).get("dbname", "postgres")

    with tempfile.TemporaryDirectory() as tmp:
        dump_file = Path(tmp) / "backup.dump"

        started = time.perf_counter()
        with psycopg.connect(source_url) as source:
            source.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
            snapshot = source.execute("SELECT pg_export_snapshot()").fetchone()[0]
            _run(
                [
                    pg_dump,
                    "--format=custom",
                    "--no-owner",
                    f"--snapshot={snapshot}",
                    "--file",
                    str(dump_file),
                    *src_flags,
                    "--dbname",
                    source_db,
                ],
                src_env,
                "pg_dump",
            )
            source_counts = _counts(source)  # same snapshot as the dump
            source.rollback()
        dump_seconds = time.perf_counter() - started
        dump_bytes = dump_file.stat().st_size

        with psycopg.connect(admin_url, autocommit=True) as admin:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(scratch)))
        try:
            started = time.perf_counter()
            try:
                _run(
                    [
                        pg_restore,
                        "--no-owner",
                        *scr_flags,
                        "--dbname",
                        scratch,
                        str(dump_file),
                    ],
                    scr_env,
                    "pg_restore",
                )
            except RuntimeError as error:
                if not ignore_restore_errors:
                    raise
                print(f"warning (ignored): {error}", file=sys.stderr)
            restore_seconds = time.perf_counter() - started
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
    parser.add_argument(
        "--ignore-restore-errors",
        action="store_true",
        help="keep going when pg_restore reports errors (e.g. managed-host extensions)",
    )
    args = parser.parse_args()

    result = run_drill(
        args.source_url,
        args.scratch_admin_url or args.source_url,
        args.pg_bin,
        args.ignore_restore_errors,
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
