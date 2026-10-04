# Estoque NY

> Inventory management API and admin frontend for a multi-branch retail business: stock per branch and location, transfers between branches, role-based access and marketing data — built to power a multi-frontend admin API.

**Docs in Portuguese (setup, Docker, Vercel deploy):** [docs/README.pt-BR.md](docs/README.pt-BR.md)

![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## What it does

- **Stock control** per branch and location, with a dedicated stock engine and domain services that keep business rules out of the routes. Negative stock can be blocked by configuration.
- **Transfers** between branches, with a transfer service and idempotent write operations (enforced in production via configuration) so retried requests do not duplicate movements.
- **Catalog:** products and SKUs.
- **Authentication and authorization:** JWT access/refresh tokens, roles and fine-grained permissions (`auth.user.manage`, `marketing.*`, ...), plus user management endpoints.
- **Marketing domain (admin only):** channels, campaigns, promotions, audience segments and content assets, with cross-domain reports.
- **Reports and audit trail.**
- **Health checks** for the API and the database (`/health`, `/health/db`).

## How it works

```text
frontend/ (React 19 + Vite + Mantine)  ──►  FastAPI  ──►  PostgreSQL (SQLite locally)
                                              │
        app/api/routes  →  app/modules  →  app/services / app/repositories
                                              │
                                        app/domain  (pure business rules:
                                        stock_engine, inventory_service, transfer_service)
```

## Tech stack

| Layer | Technology |
|---|---|
| API | FastAPI, async SQLAlchemy 2.0, Pydantic Settings, Alembic migrations |
| Database | PostgreSQL in production (Supabase / Neon / Render), SQLite for local development |
| Auth | JWT, Passlib, role and permission model |
| Frontend | React 19, TypeScript, Vite, Mantine, TanStack Query and Table |
| Tests | pytest (API), Vitest (frontend) |
| Deploy | Vercel (API as a Python function + static frontend in one project) or Render |

## Getting started

Backend with SQLite (leave `DATABASE_URL` empty in `.env`, based on `.env.example`):

```bash
uv sync
uv run uvicorn app.main:app --reload
curl http://127.0.0.1:8000/health
```

Full stack with Docker (frontend, API and Postgres):

```bash
docker compose up -d --build
# frontend http://127.0.0.1:8080 · API http://127.0.0.1:8000
```

Frontend only:

```bash
cd frontend
npm install
npm run dev      # also: npm run typecheck · npm run test · npm run build
```

With Postgres, apply migrations first: `uv run alembic upgrade head`.

## Quality checks

```bash
uv run pytest                      # API tests
cd frontend && npm run typecheck && npm run test
```

## Status

- The API domains above are implemented.
- The frontend is being migrated from a legacy vanilla-JS UI to React + TypeScript, feature by feature; the domain screens are still being built.
- Next: evolve the current API into a multi-frontend admin API with standardized prefixes (`/stock`, `/catalog`, `/marketing`, `/reports`, `/admin`) — see [docs/admin-api-roadmap.md](docs/admin-api-roadmap.md) — and feed a public product catalog to the storefront.

## License

[MIT](LICENSE)

## Author

**Lorenzo Marty** — [GitHub](https://github.com/LorenzoMarty)
