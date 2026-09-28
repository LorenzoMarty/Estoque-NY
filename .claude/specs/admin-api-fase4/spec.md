---
slug: admin-api-fase4
status: done
revision_count: 1
created: 2026-09-27
---

# Fase 4 do admin-api-roadmap: governança e consumo por frontends

## Objetivo

Implementar a Fase 4 de `docs/admin-api-roadmap.md` ("Governança e consumo por frontends") com
base no estado real do código (levantado nesta spec, não só na intenção do roadmap). Auditoria em
escritas já está 100% coberta (confirmado por varredura de todas as rotas de escrita) e filtros
já estão bem cobertos — sem REQ pra esses dois pontos. O trabalho real está em paginação
inconsistente, `response_model` faltando, e um bug de RBAC onde o papel `viewer` não consegue
listar contagens de estoque.

## Requisitos

- [x] REQ-1: `GET /catalog/products`, `GET /catalog/skus`, `GET /stock/balances`, `GET /stock/moves`
  passam a devolver `{items, meta}` (usando `pagination_params`/`apply_order_and_pagination`/
  `page_meta` do módulo compartilhado) em vez de `list[X]` puro. Hoje aceitam `page`/`page_size`
  mas descartam o total — o cliente não sabe se há mais páginas.
- [x] REQ-2: `GET /stock/inventory-counts` (list counts) e `GET /stock/transfers` (list orders)
  trocam a paginação/ordenação implementada na mão pelo helper compartilhado, igual `auth`/
  `branches`/`catalog`/`locations`/`marketing` já fazem. Filtros existentes de cada rota (status,
  branch_id, location_id, sku_id, datas) são preservados.
- [x] REQ-3: os 7 endpoints de listagem sem `response_model` tipado (5 em `marketing.py` —
  `list_channels`, `list_campaigns`, `list_promotions`, `list_audience_segments`,
  `list_content_assets` — mais `inventory.list_counts` e `transfers.list_transfer_orders`) ganham
  um schema `XxxListOut{items: list[XxxOut], meta: dict}` (reaproveitar o padrão de
  `UserListOut`/`BrandListOut`). Contagem corrigida na implementação: são 7, não 8 (marketing tem 5
  endpoints de listagem, não 6 como estimado ao escrever a spec).
- [x] REQ-4: nova permissão `stock.inventory.read` (adicionada em `ALL_PERMISSIONS`). `GET
  /stock/inventory-counts` (list) passa a exigir `stock.inventory.read` em vez de
  `stock.inventory.create`. Papel `viewer` (que só tem permissões terminadas em `.read`) ganhou
  `stock.inventory.read` automaticamente pela regra existente em `ensure_rbac_seed` — sem caso
  especial.
- [x] REQ-5: renomear permissões pra seguir `dominio.recurso.acao`:
  - `product.*` → `catalog.product.*`
  - `sku.*` (incluindo `sku.barcode.create`/`sku.barcode.delete`) → `catalog.sku.*`
  - `category.*` → `catalog.category.*`
  - `brand.*` → `catalog.brand.*`
  - `branch.*` → `stock.branch.*`
  - `location.*` → `stock.location.*`

  Migração Alembic faz `UPDATE permissions SET key = :novo WHERE key = :antigo` pra cada chave —
  `RolePermission` referencia `permission_id`, não a string, então atribuições de papel existentes
  não se perdem. `ALL_PERMISSIONS` (`app/core/permissions.py`) e todo `require_permission("...")`
  nas rotas (`branches.py`, `locations.py`, `products.py`, `skus.py`) usam as chaves novas.
  `ensure_rbac_seed` (`app/services/auth_service.py`) atualizado: a regra do papel `operator`
  (hoje `key.startswith("stock.") or key.startswith("product.") or key.startswith("sku.") or key
  in {"branch.read", "location.read", "category.read", "brand.read"}`) passa a usar os prefixos
  novos (`stock.`/`catalog.`), preservando o mesmo conjunto de permissões concedidas.
- [x] REQ-6: `scripts/seed_test_data.py` ganhou seed de Marketing (1 `MarketingChannel`, 1
  `Campaign` com produto vinculado, 1 `Promotion` com SKU vinculado, 1 `AudienceSegment`, 1
  `ContentAsset`) e de 1 `InventoryCount` POSTED com 1 linha divergente (gera 1 `ADJUSTMENT` real
  via `post_inventory_count`).

## Fora de escopo

Auditoria em escritas (já 100% coberta — confirmado por varredura de todas as rotas de escrita, sem
gap encontrado). Filtros por `q`/status/período/branch/sku/product (já bem cobertos hoje, sem gap
material identificado). `/api/v1`, fluxo de aprovação de campanhas/promoções, métricas externas de
marketing (cliques/impressões/custo/receita) — decisões pendentes separadas, já listadas no
roadmap. Reorganizar `/branches`/`/locations` para debaixo de um prefixo de rota (`/stock/branches`
etc.) — só a permissão ganha o prefixo `stock.`, a rota em si não muda nesta spec.

## Critérios de concluído (observáveis)

1. `uv run pytest` (ou `.venv-local` equivalente) e `ruff check` verdes.
2. Runtime real (curl ou browser) contra backend rodando: REQ-1 e REQ-2 — cada endpoint devolve
   `{"items": [...], "meta": {"page", "page_size", "total", "next", "prev"}}`; paginar com
   `page_size` pequeno e conferir `total`/`next` corretos. REQ-3 — `/openapi.json` mostra schema de
   resposta (não `"type": "object"` genérico) pros 8 endpoints. REQ-4 — usuário com só papel
   `viewer` consegue `GET /stock/inventory` (200, antes seria 403). REQ-5 — `GET /auth/permissions`
   devolve as chaves novas; usuário com role atribuída antes da migração continua com as mesmas
   permissões efetivas depois (comparar antes/depois). REQ-6 — rodar o script contra DB temporário e
   conferir que Marketing e InventoryCount aparecem populados.
3. Nenhum teste existente quebra por causa da renomeação de permissão (grep por chaves antigas nos
   testes antes de mudar, ajustar se algum usar a string literal).
4. Frontend não referencia essas chaves de permissão por string (confirmado por grep antes desta
   spec) — sem mudança necessária no frontend.

## Notas de implementação

- Ordem sugerida por risco: REQ-1/REQ-2/REQ-3 (sem mudança de dado, só contrato de resposta) antes
  de REQ-4/REQ-5 (RBAC, toca dado existente) antes de REQ-6 (aditivo, sem risco).
- REQ-5 é mudança de auth — avisar explicitamente antes de aplicar a migração (regra global do
  usuário: "sem mudança silenciosa em auth").

## Log de implementação (2026-09-27)

**Backend:**
- `app/core/pagination.py`: `apply_order_and_pagination` ganhou parâmetro `default_sort`
  (default `"created_at"`, backward-compatível com os 5 usos existentes) — necessário porque `SKU`
  não tem coluna `created_at` e `StockBalance`/`InventoryCount` usam `updated_at`/`started_at`.
- REQ-1: `app/api/routes/products.py`, `skus.py`, `stock.py` (`list_balances` e `list_moves`)
  migrados. `list_moves` manteve a window function de `balance_after`; os parâmetros soltos
  `limit`/`offset` (redundantes com `page`/`page_size`, confirmados sem uso em frontend/testes)
  foram removidos.
- REQ-2: `inventory.py` (`list_counts`) e `transfers.py` (`list_transfer_orders`) migrados pro
  helper compartilhado.
- REQ-3: schemas novos `ProductListOut`, `SKUListOut`, `StockBalanceListOut`, `StockMoveListOut`,
  `InventoryCountListOut`, `TransferListOut`, `MarketingChannelListOut`, `CampaignListOut`,
  `PromotionListOut`, `AudienceSegmentListOut`, `ContentAssetListOut` (substituindo o
  `MarketingListOut` genérico não tipado, que não era usado em lugar nenhum).
- REQ-4: `stock.inventory.read` adicionada a `ALL_PERMISSIONS`; `list_counts` passou a exigir essa
  permissão.
- REQ-5: `ALL_PERMISSIONS` e todo `require_permission(...)` em `branches.py`, `locations.py`,
  `catalog.py`, `products.py`, `skus.py` renomeados. `ensure_rbac_seed` (`auth_service.py`)
  ajustado — achado durante a implementação: a regra ingênua `key.startswith("stock.")` passaria a
  incluir `stock.branch.*`/`stock.location.*` (que antes do rename não existiam sob esse prefixo),
  dando ao papel `operator` permissão de criar/editar/excluir filial e local que ele nunca teve —
  corrigido excluindo esses dois prefixos da regra genérica antes de aplicar. Migração Alembic
  `3e9f8a87d290` faz `UPDATE permissions SET key=...` (idempotente via `permission_id`, preserva
  `role_permissions`).
- REQ-6: `scripts/seed_test_data.py` ganhou os dois domínios faltantes.

**Frontend** (fora do escopo original da spec, mas necessário — REQ-1 muda o contrato de resposta
de 4 endpoints que o frontend já consumia como array puro): `shared/api/catalog.ts`
(`useSkusQuery`), `features/dashboard/api.ts` (removeu o helper `fetchList` morto, unificando em
`fetchPaginated`), `features/movements/api.ts`, `features/products/api.ts`,
`features/variations/api.ts` — todos trocados de `apiClient.get<T[]>(...)` pra
`apiClient.get<Paginated<T>>(...).items`, mesmo padrão já usado por branches/locations.

**Verificação em runtime** (backend `.venv-local` :8011, frontend :8080, login
`admin@estoque.local`):
- `pytest` (13 passed), `ruff check app scripts migrations` (limpo), frontend `typecheck` e `test`
  (65/65) verdes.
- REQ-1/REQ-2: `curl` nos 5 endpoints com `page_size` pequeno — todos devolvem `{items,meta}` com
  `total`/`next` corretos (ex.: `stock/moves` total=38, `catalog/products` total=7).
- REQ-3: `/openapi.json` confirma schema tipado (não `dict` genérico) nos 7 endpoints.
- REQ-4: registrei usuário novo, atribuí role `viewer`, confirmei `GET /stock/inventory-counts`
  200 (antes seria 403 com `stock.inventory.create`).
- REQ-5: apliquei a migração no `inventory.db` local (backup em `inventory.db.bak-fase4`);
  `/auth/permissions` mostra as 58 chaves novas, 0 sobra de chave antiga; contagem de
  `role_permissions` por papel bate exatamente com a regra (admin=58, operator=28, viewer=18,
  incluindo `stock.inventory.read` no viewer). **Incidente durante a verificação:** um processo
  backend zumbi (rodando código pré-rename, sobrevivente de um restart anterior nesta sessão)
  respondeu a uma chamada e recriou 22 chaves no formato antigo via `ensure_rbac_seed` — identificado
  e limpo (`DELETE` das 22 permissões/grants órfãos) antes da verificação final; não chegou a ser
  commitado nem exposto ao usuário.
- REQ-6: script rodado 2x contra DB SQLite temporário (`Base.metadata.create_all`, contornando a
  limitação conhecida de `ALTER CONSTRAINT` do Alembic+SQLite numa migration antiga não relacionada)
  — primeira execução cria os 6 registros novos, segunda execução idempotente (0 criados).
- Não verificado: interação real no browser das 4 telas frontend ajustadas (extensão Claude in
  Chrome desconectada durante toda a sessão) — coberto por typecheck + testes unitários + paridade
  de padrão com código já em produção (branches/locations), não por clique real.
