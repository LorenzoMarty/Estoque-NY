---
slug: admin-api-fase4
status: ready
revision_count: 0
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

- [ ] REQ-1: `GET /catalog/products`, `GET /catalog/skus`, `GET /stock/balances`, `GET /stock/moves`
  passam a devolver `{items, meta}` (usando `pagination_params`/`apply_order_and_pagination`/
  `page_meta` do módulo compartilhado) em vez de `list[X]` puro. Hoje aceitam `page`/`page_size`
  mas descartam o total — o cliente não sabe se há mais páginas.
- [ ] REQ-2: `GET /stock/inventory` (list counts) e `GET /stock/transfers` (list orders) trocam a
  paginação/ordenação implementada na mão pelo helper compartilhado, igual `auth`/`branches`/
  `catalog`/`locations`/`marketing` já fazem. Filtros existentes de cada rota (status, branch_id,
  location_id, sku_id, datas) são preservados.
- [ ] REQ-3: os 8 endpoints de listagem sem `response_model` tipado (`marketing.list_channels`,
  `list_campaigns`, `list_promotions`, `list_audience_segments`, `list_content_assets`, mais o
  endpoint de detalhe que também devolve `dict`; `inventory.list_counts`; `transfers.
  list_transfer_orders`) ganham um schema `XxxListOut{items: list[XxxOut], meta: dict}` (reaproveitar
  o padrão de `UserListOut`/`BrandListOut`).
- [ ] REQ-4: nova permissão `stock.inventory.read` (adicionar em `ALL_PERMISSIONS`). `GET
  /stock/inventory` (list) passa a exigir `stock.inventory.read` em vez de
  `stock.inventory.create`. Papel `viewer` (que hoje só tem permissões terminadas em `.read`) ganha
  `stock.inventory.read` automaticamente pela regra existente em `ensure_rbac_seed` — sem precisar
  de caso especial.
- [ ] REQ-5: renomear permissões pra seguir `dominio.recurso.acao`:
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
- [ ] REQ-6: `scripts/seed_test_data.py` ganha seed de Marketing (1 `MarketingChannel`, 1
  `Campaign`, 1 `Promotion`, 1 `AudienceSegment`, 1 `ContentAsset`) e de 1 `InventoryCount` fechado
  com ao menos 1 ajuste lançado — hoje o script cobre branch/location/category/brand/product/sku/
  stock move/transfer, mas não esses dois domínios.

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
