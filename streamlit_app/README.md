# Streamlit Backoffice (Estoque ERP)

Interface Streamlit basica para operar a API FastAPI de estoque/ERP:

- Login JWT
- Dashboard
- Transfers
- Inventory Counts
- Products / SKUs
- Users & Roles (admin)
- Reports
- Audit Logs (quando endpoint existir)
- Stock Explorer

## 1) Instalar dependencias

```bash
pip install -r streamlit_app/requirements.txt
```

## 2) Configurar ambiente

```bash
cp streamlit_app/.env.example streamlit_app/.env
```

Edite `API_BASE_URL` (exemplo):

```env
API_BASE_URL=http://localhost:8000
```

## 3) Rodar

```bash
streamlit run streamlit_app/app.py
```

## Endpoints esperados

O app detecta rotas via `/openapi.json`. Quando uma rota nao existe, a UI mostra `endpoint indisponivel` sem quebrar.

Principais rotas usadas:

- Auth: `/auth/login`, `/auth/me`, `/auth/register`, `/auth/roles/assign`
- Base: `/health`, `/health/db`
- Cadastros: `/branches`, `/locations`, `/products`, `/skus`, `/categories`, `/brands`
- Estoque: `/stock/receipts`, `/stock/issues`, `/stock/adjustments`, `/stock/balances`, `/stock/moves`
- Transferencias: `/stock/transfers`, `/stock/transfers/{id}`, `/ship`, `/receive`, `/cancel`
- Inventario: `/stock/inventory-counts`, `/stock/inventory-counts/{id}`, `/lines`, `/close`, `/post`, `/cancel`
- Reports: `/reports/stock/valuation`, `/turnover`, `/movements`, `/abc`

## Idempotency-Key

Acoes criticas enviam automaticamente header `Idempotency-Key` com UUID:

- transfer ship/receive/cancel (e create)
- inventory post/close/cancel/patch lines/create
- stock adjustments e movimentos rapidos

## Observacoes

- O bloqueio de permissao real e sempre do backend (RBAC).
- Claims do JWT sao usadas no frontend apenas para exibir/ocultar menus.
- Para Users/Roles e Audit Logs, a UI opera somente com rotas disponiveis no OpenAPI atual.
