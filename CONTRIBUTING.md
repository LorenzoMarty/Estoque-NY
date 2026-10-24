# Contributing

## Run it

Backend (SQLite, no setup; leave `DATABASE_URL` empty in `.env`, copied from `.env.example`):

```bash
uv sync --frozen --python 3.12
uv run uvicorn app.main:app --reload     # http://127.0.0.1:8000/health
```

Frontend: `cd frontend && npm ci && npm run dev` (http://127.0.0.1:8080).
Full stack with Postgres: `docker compose up -d --build`. With Postgres, run `uv run alembic upgrade head` first.

## Verify (same gate as CI, `.github/workflows/ci.yml`)

```bash
uv run ruff check . && uv run ruff format --check .
uv run mypy app
uv run pytest -q
cd frontend && npm ci && npm run build   # typecheck + vitest + build + bundle budget
```

`uvx pre-commit install` runs the lint and type gate on every commit.

## Workflow

- One branch per issue, named `type/<n>-short-description` (e.g. `feat/12-corretor-v2`). Nothing goes straight to `master`.
- Commits and PR titles use Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`), imperative, in English. One subject per commit.
- Open the PR from `.github/pull_request_template.md` with `Closes #N`; merge with *Squash and merge*.
- Issues use the Feature or Bug template and always carry a "done" criterion.
- Every non-draft PR gets an automatic review; answer or fix each point before merging.

## Conventions

- Business rules live in `app/domain`; routes stay thin (`app/api/routes` → `app/services` / `app/repositories`).
- Schema changes need an Alembic migration (`migrations/versions`); `tests/test_migrations.py` checks them.
- The public API (`/public/v1/*`) is frozen by snapshots in `tests/contracts/`; inside v1 only additive changes ([ADR 0001](docs/adr/0001-catalog-contract.md)).
- Record decisions that are hard to reverse as an ADR in `docs/adr/` (copy `docs/adr/0000-template.md`).
- Architecture overview: [docs/architecture.md](docs/architecture.md).
