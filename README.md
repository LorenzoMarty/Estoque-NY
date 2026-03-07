# Estoque NY

Projeto com backend FastAPI + frontend estatico para operacao de estoque.

## Stack

- API: FastAPI
- ORM: SQLAlchemy async
- Migracoes: Alembic
- Banco em producao: PostgreSQL (Render)
- Frontend: HTML/CSS/JS estatico em `frontend/`

## Configuracao local

Use `.env` na raiz com base no `.env.example`.

Variaveis principais:

```env
APP_ENV=local
LOG_LEVEL=INFO

JWT_SECRET=change-me
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=60
JWT_REFRESH_EXPIRATION_MINUTES=1440
AUTH_ENABLED=true

DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:55432/inventory
SQLITE_URL=sqlite+aiosqlite:///./inventory.db

ALLOW_NEGATIVE_STOCK=false
IDEMPOTENCY_REQUIRED_IN_PRODUCTION=true
CORS_ORIGINS=*
```

### Rodar backend

Com Postgres local (recomendado):

```bash
docker compose up -d
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Fallback SQLite:

1. Deixe `DATABASE_URL` vazio no `.env`.
2. Rode:

```bash
uv run uvicorn app.main:app --reload
```

### Rodar frontend

```bash
cd frontend
npm install
npm run dev
```

Scripts do frontend:

- `npm run dev`: servidor estatico local (`PORT` ou `8080`)
- `npm run test`: validacao de sintaxe JS e assets
- `npm run build`: alias para `npm run test`

## Deploy no Vercel (API + frontend no mesmo projeto)

Este repositorio agora esta preparado para subir no Vercel em um unico projeto:

- API FastAPI via `api/index.py` (Python Function do Vercel)
- Frontend estatico copiado para `public/` no build (`scripts/prepare_vercel_static.py`)
- Frontend consumindo API em `/api` no mesmo dominio automaticamente

### 1) Preparar banco PostgreSQL

Use um Postgres gerenciado (Neon, Supabase, Render, RDS etc.).
Copie a URL de conexao e use em `DATABASE_URL`.

### 2) Aplicar migracoes no banco de producao

Antes do primeiro deploy no Vercel:

```bash
DATABASE_URL=<url_do_postgres_de_producao> uv run alembic upgrade head
```

Sempre que criar novas migracoes, rode este comando novamente no banco de producao.

### 3) Criar projeto no Vercel

1. Faca push do repositorio no GitHub.
2. No Vercel: **Add New...** -> **Project**.
3. Selecione este repositorio.
4. Use o projeto na raiz (nao use `frontend` como Root Directory).
5. Deploy.

Observacao:
- A configuracao de build esta em `vercel.json`.
- O Vercel executa:
  - `python scripts/prepare_vercel_static.py`
- Esse script copia `frontend/index.html`, `frontend/css`, `frontend/js` e `frontend/vendor` para `public/`.

### 4) Configurar variaveis de ambiente no Vercel

Defina no projeto:

- `APP_ENV=production`
- `DATABASE_URL=<url_do_postgres_de_producao>`
- `JWT_SECRET=<segredo_forte>`
- `AUTH_ENABLED=true`
- `LOG_LEVEL=INFO`
- `JWT_ALGORITHM=HS256`
- `JWT_EXPIRATION_MINUTES=60`
- `JWT_REFRESH_EXPIRATION_MINUTES=1440`
- `ALLOW_NEGATIVE_STOCK=false`
- `IDEMPOTENCY_REQUIRED_IN_PRODUCTION=true`
- `CORS_ORIGINS=https://<seu-projeto>.vercel.app`

Se usar dominio customizado, inclua tambem esse dominio em `CORS_ORIGINS`.

### 5) Validar deploy

Depois do deploy:

- Frontend: `https://<seu-projeto>.vercel.app`
- Health API: `https://<seu-projeto>.vercel.app/api/health`
- Health DB: `https://<seu-projeto>.vercel.app/api/health/db`

### 6) Criar primeiro usuario

Com a API online, crie o primeiro usuario via `POST /api/auth/register`.
O primeiro usuario recebe papel `admin` automaticamente.

### 7) (Opcional) Popular dados de teste

Para ambiente de homologacao:

```bash
uv run python scripts/seed_test_data.py
```

## Deploy no Render (API + frontend)

Este repositorio ja inclui `render.yaml` para o backend.

### 1) Deploy da API via Blueprint (recomendado)

1. Faca push do repositorio no GitHub.
2. No Render: **New +** -> **Blueprint**.
3. Selecione o repo e confirme.
4. O service `estoque-ny-api` sera criado com:
   - Build command: `pip install -r requirements.txt`
   - Start command: `sh -c "alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT"`
   - Health check: `/health`

### 2) Criar e conectar PostgreSQL no Render

1. No Render: **New +** -> **PostgreSQL**.
2. Copie o **Internal Database URL** do banco criado.
3. No service `estoque-ny-api`, abra **Environment** e defina:

```text
DATABASE_URL=<Internal Database URL do Postgres do Render>
```

4. Salve e faca redeploy da API.

Observacao: se a URL vier como `postgres://` ou `postgresql://`, a app converte
automaticamente para `postgresql+asyncpg://`.

### 3) Variaveis obrigatorias da API no Render

- `APP_ENV=production`
- `DATABASE_URL=<Internal Database URL>`
- `JWT_SECRET=<segredo forte>`
- `AUTH_ENABLED=true`
- `LOG_LEVEL=INFO`
- `CORS_ORIGINS=https://<seu-frontend>.onrender.com`

Tambem recomendadas (ja no `render.yaml`):

- `JWT_ALGORITHM=HS256`
- `JWT_EXPIRATION_MINUTES=60`
- `JWT_REFRESH_EXPIRATION_MINUTES=1440`
- `ALLOW_NEGATIVE_STOCK=false`
- `IDEMPOTENCY_REQUIRED_IN_PRODUCTION=true`

### 4) Deploy do frontend no Render (Static Site)

1. No Render: **New +** -> **Static Site**.
2. Selecione o mesmo repo.
3. Configure:
   - Root Directory: `frontend`
   - Build Command: `npm ci && npm run build`
   - Publish Directory: `.`
4. Antes de publicar, ajuste `frontend/js/api.js` para apontar para a API do Render:

```js
export const API_BASE_URL = "https://<nome-da-sua-api>.onrender.com";
```

5. Deploy.

### 5) Checklist pos deploy

- API respondendo: `https://<nome-da-sua-api>.onrender.com/health`
- Frontend carregando sem tela em branco
- Frontend fazendo requests para a URL da API no Render (na aba Network)
- Sem erro de CORS no console do navegador

## Migracoes

Aplicar ultima migracao:

```bash
uv run alembic upgrade head
```

Gerar nova revisao:

```bash
uv run alembic revision --autogenerate -m "descricao_da_mudanca"
```

## Qualidade

```bash
uv run ruff check app scripts migrations
uv run black --check app scripts migrations
uv run mypy app
```
