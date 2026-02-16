# Estoque NY API

Backend de estoque multi-filial em FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL.

## Rodando local

```bash
docker compose up -d
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## Testes e qualidade

```bash
uv run pytest
uv run ruff check app tests
uv run mypy app tests
```

## Fluxo de Transferência

1. `POST /stock/transfers` cria pedido em `DRAFT`.
2. `POST /stock/transfers/{id}/ship` baixa estoque da origem (`TRANSFER_SHIP`) e muda para `SHIPPED`.
3. `POST /stock/transfers/{id}/receive` dá entrada no destino (`TRANSFER_RECEIVE`) e muda para `RECEIVED`.
4. `POST /stock/transfers/{id}/cancel`:
   - `DRAFT`: cancela.
   - `SHIPPED` ou `RECEIVED`: bloqueado (necessário fluxo reverso explícito).

## Fluxo de Inventory Count

1. `POST /stock/inventory-counts` abre contagem `OPEN`.
   - `scope=ALL`: cria linhas para SKUs com saldo na location.
   - `scope=SKUS`: usa `sku_ids` informados.
2. `PATCH /stock/inventory-counts/{id}/lines` registra `counted_qty`.
3. `POST /stock/inventory-counts/{id}/close` fecha (`CLOSED`) sem lançar ajuste.
4. `POST /stock/inventory-counts/{id}/post` aplica ajustes (`ADJUSTMENT`, reason `INVENTORY_COUNT`) para `diff_qty != 0` e muda para `POSTED`.
5. `POST /stock/inventory-counts/{id}/cancel` cancela se ainda não `POSTED`.

## Decisões do MVP hardening

- Estoque negativo: **não permitido** por padrão (`allow_negative_stock=false`).
- Idempotência: chave por `(Idempotency-Key + route)` com `request_hash`; reutilização com payload diferente retorna `409`.
- POSTs críticos (movimentação/transferência/inventário): suportam idempotência com replay da mesma resposta.
- Auth: JWT access + refresh com RBAC por permissão.
- Auditoria: toda mutação relevante grava `audit_logs` com actor, ação, before/after e metadados de request.
- Paginação padrão em listagens: `page`, `page_size`, `sort`, `order` e filtros por recurso.
