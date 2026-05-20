# Estoque NY

Projeto com backend FastAPI + frontend estatico para operacao de estoque.
Se o banco estiver no Supabase, este repositorio usa o Supabase apenas como provedor PostgreSQL.
O fluxo de login em producao e JWT proprio da API, nao Supabase Auth.

## Stack

- API: FastAPI
- ORM: SQLAlchemy async
- Migracoes: Alembic
- Banco em producao: PostgreSQL (Supabase, Neon, Render, RDS etc.)
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

DATABASE_URL=
SQLITE_URL=sqlite+aiosqlite:///./inventory.db

ALLOW_NEGATIVE_STOCK=false
IDEMPOTENCY_REQUIRED_IN_PRODUCTION=true
CORS_ORIGINS=*
```

### Rodar backend local sem Docker

Deixe `DATABASE_URL=` vazio no `.env`. Assim a API usa SQLite em
`inventory.db` na raiz do projeto.

```bash
uv run uvicorn app.main:app --reload
```

Health checks locais:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/health/db
```

### Rodar backend com Postgres local opcional

```bash
docker compose up -d
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Para usar este modo, defina `DATABASE_URL` no `.env` como
`postgresql+asyncpg://postgres:postgres@localhost:55432/inventory`.

### Rodar frontend, backend e banco com Docker

```bash
docker compose up -d --build
```

URLs locais:

- Frontend: `http://127.0.0.1:8080`
- Backend: `http://127.0.0.1:8000`
- Health API: `http://127.0.0.1:8000/health`
- Health DB: `http://127.0.0.1:8000/health/db`
- Postgres no host: `localhost:55432`

Comandos uteis:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
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
- `framework: null` em `vercel.json` força o preset **Other** e evita conflito com um Framework Preset salvo no dashboard do Vercel.
- O Vercel executa:
  - `python scripts/prepare_vercel_static.py`
- Esse script copia `frontend/index.html`, `frontend/css`, `frontend/js` e `frontend/vendor` para `public/`.
- O `outputDirectory` explicito foi removido. O Vercel serve `public/**` automaticamente para este projeto e isso evita conflito com a publicacao das Functions em `api/**`.
- O deploy usa `api/index.py` para `/api` e `api/[...path].py` para capturar `/api/*` diretamente pelo filesystem routing da Vercel, sem rewrite ambiguo.
- A configuracao `functions` usa `api/**/*.py`, entao qualquer Python Function dentro de `api/` continua sendo reconhecida.
- A app FastAPI responde tanto sem prefixo (`/health`) quanto com prefixo (`/api/health`) para tolerar como a Vercel encaminha o path para a ASGI app.

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

Se o banco for Supabase, use a string de conexao PostgreSQL em `DATABASE_URL`.
Nao configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou chaves de Supabase Auth: este frontend nao usa o client JS do Supabase.

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
