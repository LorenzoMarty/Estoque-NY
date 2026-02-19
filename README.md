# Estoque NY

Backend FastAPI para ERP de estoque com SQLAlchemy async e Alembic.

## Stack atual

- API: FastAPI
- ORM: SQLAlchemy 2.0 (async)
- Migrações: Alembic
- Banco produção: PostgreSQL (Render)
- Banco local opcional: SQLite (somente quando `DATABASE_URL` estiver vazio)

## Configuração de ambiente

Use `.env` na raiz (base em `.env.example`).

### Variáveis principais

```env
APP_ENV=local
LOG_LEVEL=INFO

JWT_SECRET=change-me
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=60
JWT_REFRESH_EXPIRATION_MINUTES=1440
AUTH_ENABLED=true

# Produção (Render): usar Internal Database URL aqui.
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:55432/inventory

# Fallback local opcional (usado apenas se DATABASE_URL estiver vazio):
SQLITE_URL=sqlite+aiosqlite:///./inventory.db

ALLOW_NEGATIVE_STOCK=false
IDEMPOTENCY_REQUIRED_IN_PRODUCTION=true
CORS_ORIGINS=*
```

## Como rodar localmente

### Opção A: PostgreSQL (recomendado)

1. Subir banco:
```bash
docker compose up -d
```

2. Aplicar migrações:
```bash
uv run alembic upgrade head
```

3. Subir API:
```bash
uv run uvicorn app.main:app --reload
```

### Opção B: SQLite (fallback local)

1. Deixe `DATABASE_URL` vazio e configure `SQLITE_URL` no `.env`.
2. Rode API normalmente:
```bash
uv run uvicorn app.main:app --reload
```

## Migrações de schema

Aplicar última versão:

```bash
uv run alembic upgrade head
```

Gerar nova revisão (quando necessário):

```bash
uv run alembic revision --autogenerate -m "descricao_da_mudanca"
```

## Migração de dados SQLite -> PostgreSQL

Script one-shot criado em:

- `scripts/migrate_sqlite_to_postgres.py`

Fluxo recomendado:

1. Configure `DATABASE_URL` para o Postgres de destino.
2. Execute:

```bash
uv run python scripts/migrate_sqlite_to_postgres.py --sqlite-path ./inventory.db
```

Opções úteis:

- `--truncate-target`: limpa tabelas do destino antes de copiar
- `--skip-migrations`: pula `alembic upgrade head`
- `--batch-size 500`: tamanho de lote de insert
- `--postgres-url ...`: sobrescreve `DATABASE_URL`
- `--sqlite-url ...`: sobrescreve `--sqlite-path`

## Deploy no Render (produção)

Este repositório inclui `render.yaml` com configuração pronta.

### 1) Criar Web Service

- Runtime: Python
- Build Command:
```bash
pip install -r requirements.txt
```
- Start Command:
```bash
sh -c "alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT"
```
- Health Check Path:
```text
/health
```

### 2) Criar banco Render Postgres

1. Crie um Postgres gerenciado no Render.
2. Copie o **Internal Database URL**.
3. Defina no Web Service:

```text
DATABASE_URL=<Internal Database URL do Render>
```

Observação:

- Se o Render fornecer `postgres://...`, a aplicação converte automaticamente para `postgresql+asyncpg://...`.

### 3) Variáveis mínimas no Render

- `APP_ENV=production`
- `DATABASE_URL=<Internal Database URL>`
- `JWT_SECRET=<segredo forte>`
- `LOG_LEVEL=INFO`
- `AUTH_ENABLED=true`

## Testes e qualidade

```bash
uv run ruff check app scripts migrations
uv run black --check app scripts migrations
uv run mypy app
```

## Compatibilidade

- Endpoints e contratos HTTP foram mantidos.
- Regras de negócio não foram alteradas.

