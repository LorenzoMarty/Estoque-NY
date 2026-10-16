# E2E (Playwright)

Browser tests against the real API. They need a running API (Postgres recommended) and
the built frontend; CI does this in the `e2e` job of `.github/workflows/ci.yml`.

Locally:

```bash
# 1. API on an empty database (first registered user becomes admin)
DATABASE_URL=... CORS_ORIGINS=http://127.0.0.1:8080 uv run alembic upgrade head
DATABASE_URL=... CORS_ORIGINS=http://127.0.0.1:8080 uv run uvicorn app.main:app --port 8000

# 2. Frontend pointing at it
cd frontend
VITE_API_URL=http://127.0.0.1:8000 npx vite build && npx vite preview --port 8080

# 3. Tests (E2E_CHANNEL=chrome reuses an installed Chrome instead of downloading Chromium)
npx playwright install chromium        # or: E2E_CHANNEL=chrome npx playwright test
npx playwright test
```

Each run seeds its own branches and SKU through the API (`helpers.ts`), so specs never
depend on leftovers; the admin user is created on first use. On failure Playwright keeps a
trace (`npx playwright show-trace test-results/<test>/trace.zip`) and a screenshot.

Variables: `E2E_BASE_URL` (default `http://127.0.0.1:8080`), `E2E_API_URL`
(default `http://127.0.0.1:8000`).
