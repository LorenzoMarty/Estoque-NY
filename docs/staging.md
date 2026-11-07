# Staging, previews and release migrations

## Layout

| Environment | Blueprint | API | DB |
|---|---|---|---|
| production | `render.yaml` | `estoque-ny-api` | production Postgres |
| staging | `render.staging.yaml` | `estoque-ny-api-staging` | `estoque-ny-staging-db` (never production data) |
| PR preview | `previews` on the front in `render.yaml` | staging API | staging DB |

## One-time setup (manual, in the Render dashboard)

1. New > Blueprint > this repo > blueprint path `render.staging.yaml`.
2. Set `CORS_ORIGINS` on the staging API to the staging front origin and the preview origins; set `VITE_API_URL` on the staging front to the staging API URL.
3. Seed staging: `DATABASE_URL=<staging> uv run python scripts/seed_test_data.py`.
4. In the production blueprint, give the front PR previews `VITE_API_URL` = staging API URL (Environment > preview overrides), so a preview never talks to production.

## Migrations are a release step

`preDeployCommand: alembic upgrade head` runs before the new version gets traffic. If it fails, Render aborts the deploy and the previous version stays up. The start command no longer migrates.
Pre-deploy commands need a paid Render instance; on the free plan Render ignores them, so put `alembic upgrade head && ` back in `startCommand` there.

A migration must be backwards compatible with the version still serving while it runs (add columns nullable, drop in a later release).

## Checks (runtime, by the maintainer)

- Open a PR touching `frontend/`: a preview URL appears on the PR.
- Push a deliberately failing migration to staging: the deploy fails and `/health` still answers with the old version.
