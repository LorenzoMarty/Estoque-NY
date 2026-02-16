# Estoque NY

Projeto fullstack Python com:

- Backend FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL
- Frontend Streamlit (backoffice operacional)

## Estrutura

```text
app/
  main.py
  core/
    config.py
    db.py
    auth.py
    security.py
    pagination.py
    middleware.py
    logging.py
    errors.py
  db/
    session.py
  api/
    router.py
    routes/        # compatibilidade
  modules/
    auth/
    branches/
    locations/
    catalog/
    products/
    skus/
    stock/
    transfers/
    inventory/
    reports/
    audit/
  domain/
  models/
  schemas/
  services/

streamlit_app/
  app.py
  pages/
  lib/
  requirements.txt
```

## Ambiente

Use o arquivo raiz `.env` para API/DB e `streamlit_app/.env` para frontend.

### Exemplo raiz (`.env.example`)

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:55432/inventory
APP_ENV=local
JWT_SECRET=change-me
```

### Exemplo frontend (`streamlit_app/.env.example`)

```env
API_BASE_URL=http://localhost:8000
```

## Rodando backend

```bash
docker compose up -d
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## Rodando frontend

```bash
pip install -r streamlit_app/requirements.txt
streamlit run streamlit_app/app.py
```

## Testes e qualidade

```bash
uv run pytest
uv run ruff check app tests streamlit_app
uv run black --check app tests streamlit_app
uv run mypy app tests
```

## Notas de refatoracao

- Rotas permanecem retrocompativeis (mesmos endpoints HTTP).
- Configuracao centralizada em `app/core/config.py` com shim em `app/core/settings.py`.
- Sessao de banco centralizada em `app/db/session.py` com shim em `app/core/db.py`.
- Erros padronizados com envelope:
  - `{"error":{"code","message","details","request_id"}}`
- Middleware unico com `request_id` + access log estruturado.
- Roteamento modular via `app/modules/*`.
- Novo endpoint de leitura de auditoria:
  - `GET /audit-logs`
