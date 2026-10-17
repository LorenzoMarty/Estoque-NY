# Runbook: production database (Postgres)

Production runs on **PostgreSQL only**: with `APP_ENV=production` the API refuses to boot
on SQLite or on a `localhost` URL (`app/core/config.py`). The `*.db` files are for local
development; they are git-ignored and none is tracked (`git ls-files | grep -i '\.db'`
must stay empty).

> **Status of this document.** The procedure and the restore drill script are real and were
> rehearsed (see the log). Enabling backups and PITR on the hosting provider, and doing the
> first restore of a *production* backup, need access to the provider account and are
> still to be done by the owner. Tick the checklist below when they are.

## 1. What must be in place

| # | Item | Done |
|---|---|---|
| 1 | Provider backups with **point-in-time recovery** enabled (see the table below) | ☐ |
| 2 | Retention at least 7 days (PITR window) and one weekly logical dump kept for 4 weeks | ☐ |
| 3 | A second person (or a password manager entry) holds the provider login and the restore steps | ☐ |
| 4 | A restore of a **production** backup into a scratch database, logged in section 4 | ☐ |
| 5 | Calendar reminder: repeat the drill every quarter and after any provider/plan change | ☐ |

Targets to agree and write here once decided: **RPO** (how much data we can lose; with PITR
it is minutes) and **RTO** (how long until the API is back; the drill measures the restore
part).

### Provider notes (verify in the provider's console, plans change)

| Provider | Backups | PITR |
|---|---|---|
| Supabase | Daily backups on paid plans | Add-on / higher plans; check the plan includes it |
| Neon | History retention window | Branch/restore to a timestamp within the retention window |
| Render Postgres | Daily backups on paid instances | Check the instance tier |

If the plan has no PITR, take a logical dump daily (`pg_dump --format=custom`) from a
scheduled job **outside** the app, store it encrypted in object storage, and treat the
restore drill as the only proof the dumps work. Do not park dumps as CI artifacts: they
contain password hashes and customer-adjacent data.

## 2. Restore procedure

Never restore over the live database first. Restore into a scratch database, check it,
then switch.

1. **Decide the target time** (PITR) or pick the dump (logical).
2. **Create a new database/branch** at that point from the provider console (PITR), or:
   ```bash
   createdb -h <host> -U <admin> inventory_restore
   pg_restore --no-owner --dbname "postgresql://<admin>@<host>/inventory_restore" backup.dump
   ```
3. **Check it** with the drill checks: table counts against what you expect, latest
   `StockMove.created_at`, `alembic_version` equal to the head of the deployed code.
4. **Point the API at it**: change `DATABASE_URL` in the host (Render) and redeploy. The
   API's start command (`render.yaml`) runs `alembic upgrade head` before gunicorn, which is a
   no-op when the version matches.
5. **Verify**: `GET /health`, then log in and open the dashboard and *Movimentações*.
6. Keep the damaged database until the incident is closed; do not drop it.

## 3. Rehearse it: the drill script

`scripts/restore_drill.py` automates steps 2 and 3 against any Postgres, read-only on the
source:

```bash
uv run python scripts/restore_drill.py --source-url "postgresql://user:pass@host:5432/inventory"
# needs pg_dump/pg_restore on PATH, or: --pg-bin /usr/lib/postgresql/16/bin
```

It dumps the source from an exported snapshot (so a live source does not cause false
mismatches; the password goes through the environment, not the command line), restores into a throw-away `restore_drill_<id>` database on the same
server, compares the row count of **every table**, drops the scratch database and prints
a log row. Exit code 1 means some table did not match. `tests/test_restore_drill.py`
covers it when a Postgres `TEST_DATABASE_URL` and `pg_dump` are available (the CI
`backend (postgres)` job has both).

For production, run it from a machine that can reach the database, with a **read-only**
role as source, and a scratch server you control (`--scratch-admin-url`) if the provider
does not let you create databases.

## 4. Drill log

| Date | Source | Size | Time | Result | Who |
|---|---|---|---|---|---|
| 2026-10-16 | **Local rehearsal**: PostgreSQL 16 with synthetic load-test data (28 tables, 5143 rows). Not production. | 279 KiB | dump 0.9 s, restore 1.6 s | OK, all 28 tables match | Claude Code, for the owner |
| _first production drill_ | | | | | |

## 5. Related

- Why the app refuses SQLite in production: `app/core/config.py`.
- Migrations on Postgres are tested in CI (`backend (postgres)`), including a
  downgrade/re-upgrade of the recent revisions.
- Observability and alerts: issue #9.
