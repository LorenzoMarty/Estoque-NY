---
slug: reports-marketing-cross
status: done
revision_count: 1
artifact_url:
created: 2026-09-12
---

# Relatórios cruzados marketing + catálogo + estoque (Fase 2 do roadmap admin-api)

## Objetivo

Implementar a Fase 2 de `docs/admin-api-roadmap.md`: endpoints de relatório que combinam dados de
Marketing, Catálogo e Estoque, mais a UI correspondente no frontend existente. Fase 1 (módulo
Marketing) já entregue; esta fase entrega os relatórios cruzados listados no roadmap.

## Requisitos

- [x] REQ-1: `GET /reports/marketing/campaign-products` — lista produtos vinculados a campanha
  (`CampaignProduct`) com saldo atual agregado por produto (soma de `StockBalance.on_hand` de
  todos os SKUs do produto via `SKU.product_id`). Filtros: `branch_id`, `campaign_id` (ambos
  opcionais). Paginado (`page`/`page_size`, `page_meta`, mesmo padrão de `reports.py`).
- [x] REQ-2: `GET /reports/marketing/promotion-skus` — lista SKUs vinculados a promoção
  (`PromotionSKU`) com preço/custo do SKU. Filtros: `promotion_id`, `status` (status da promoção)
  opcionais. Paginado.
- [x] REQ-3: `GET /reports/marketing/campaigns` — campanhas por período e canal. Filtros:
  `from_date`, `to_date` (sobre `starts_at`/`ends_at`), `channel_id`, `status` opcionais. Paginado.
- [x] REQ-4: `GET /reports/marketing/low-turnover-candidates` — SKUs candidatos a campanha por
  baixo giro: reusa cálculo de turnover de `/reports/stock/turnover`
  (`issued_qty`/`average_stock`), retorna SKUs com `turnover <= threshold`. `threshold` é query
  param numérico opcional com default baixo (ex.: 0.5). Filtros adicionais: `branch_id`,
  `from_date`, `to_date`. Paginado.
- [x] REQ-5: `GET /reports/marketing/dashboard-summary` — resumo operacional agregando: valorização
  total de estoque (soma de `on_hand * cost`), contagem de campanhas ativas, contagem de promoções
  ativas, contagem de produtos em baixo giro (mesmo critério do REQ-4 com threshold default), top N
  SKUs por valor de saída (reusa lógica de `/reports/stock/abc`). Sem paginação (payload único
  agregado).
- [x] REQ-6: todos os 5 endpoints protegidos por `require_permission("reports.marketing.read")`
  (permissão já existe em `app/core/permissions.py`).
- [x] REQ-7: schemas Pydantic novos em `app/schemas/report.py` (ou arquivo equivalente) para cada
  um dos 5 payloads, seguindo padrão de `StockValuationRow`/`StockTurnoverRow`/`StockABCRow`.
- [x] REQ-8: frontend — nova seção "Marketing" na tela de Relatórios (`frontend/js/reports.js`),
  consumindo os 5 endpoints acima. Cada um dos 5 relatórios ganha visualização em gráfico
  (Chart.js), seguindo padrão de `frontend/js/reports_charts.js`. Filtros integrados ao estado
  existente (`state.js`). Labels em pt-BR via `i18n.js`.
- [x] REQ-9: testes de fluxo cobrindo os 5 endpoints (RBAC negando sem permissão, dados corretos
  com fixtures), seguindo padrão dos testes existentes de `reports.py`/`marketing.py`.

## Critérios de concluído

- Os 5 endpoints respondem corretamente com dados reais (testado via pytest + chamada real, não só
  leitura de código).
- RBAC bloqueia acesso sem a permissão `reports.marketing.read` (teste 403).
- Frontend renderiza os 5 gráficos consumindo os endpoints reais — validado em smoke test no
  browser (não só que o código foi escrito).
- `uv run pytest` passa.
- `uv run ruff check app tests migrations` sem erros novos.

## Fora de escopo

- Fluxo de aprovação de campanha/promoção.
- Métricas externas de marketing (clique, impressão, custo, receita).
- Import/export CSV de campanhas e promoções.
- Seeds de dados de exemplo para Marketing.
- Fase 3 (reorganização de rotas/aliases) e Fase 4 (governança) do roadmap.
- `/api/v1`.

## Skills

Ver `.claude/specs/reports-marketing-cross/skills-plan.yaml`.

## Log da entrevista

- P: Implementar os 5 relatórios de uma vez, ou subset? / R: Todos os 5.
- P: Critério de "baixo giro" pro relatório de candidatos a campanha? / R: Turnover abaixo de
  threshold configurável (reusa cálculo de `/reports/stock/turnover`).
- P: O que o resumo operacional de dashboard deve conter? / R: Estoque + marketing combinado
  (valorização total, campanhas/promoções ativas, baixo giro, top SKUs por valor de saída).
- P: Fora de escopo é só backend? / R: Não — incluir também frontend.
- P: O que incluir no frontend? / R: Todos os 5 relatórios com gráficos (Chart.js), seguindo
  padrão de `reports_charts.js`.

## Log de implementação (2026-09-12)

- Backend: 5 endpoints em `app/api/routes/reports.py` (`marketing_router`, prefix
  `/reports/marketing`), registrados em `app/modules/reports/{__init__,router}.py` e
  `app/api/router.py`. Schemas novos em `app/schemas/report.py`. RBAC via
  `reports.marketing.read` (já existente).
- Testes: `tests/test_reports_marketing.py` (6 testes: RBAC 401 + 5 endpoints), TDD (RED
  confirmado com 404 antes da implementação, GREEN depois). Suíte completa: `uv run pytest`
  11 passed. `uv run ruff check app tests migrations`: sem erros.
- Frontend: nova seção "Marketing" em `frontend/js/reports.js` (`buildMarketingView`,
  `renderMarketingSection`, `refreshMarketingReportsData`, `bindMarketingEvents`), 5 gráficos
  novos em `frontend/js/reports_charts.js`, fetch em `frontend/js/api.js`
  (`loadMarketingReportsPayload`), estado em `frontend/js/state.js` (`reportsMarketing` +
  setters), labels em `frontend/js/i18n.js` (`reports_marketing`). Sem modo demo (não pedido
  para estes 5 relatórios — decisão de escopo do implementador).
- Verificação em runtime: smoke test real no browser (Playwright) contra backend isolado
  (porta 8001, SQLite temporário, dados via API) — login, navegação até Relatórios, seção
  Marketing renderizando KPIs corretos (valorização, campanhas/promoções ativas, baixo giro) e
  os 5 canvases com Chart.js instanciado. Encontrado e corrigido em runtime: bug real de
  "Canvas is already in use" ao clicar em "Atualizar marketing" duas vezes (charts da seção
  marketing não eram destruídos antes de recriar) — corrigido com `destroyMarketingReportsCharts()`
  em `reports_charts.js`, resmoke-testado e confirmado sem erro.
- Incidente durante o smoke test (sem relação com o código da spec): um processo `uvicorn`
  antigo e não relacionado já estava rodando na porta 8000 apontando para o `inventory.db`
  real do projeto. As primeiras chamadas de seed do smoke test foram parar nesse banco real por
  engano (1 usuário + 1 produto + 1 SKU de teste). Detectado, revertido (linhas removidas,
  backup temporário criado e depois apagado a pedido do usuário) e o smoke test refeito de
  forma isolada na porta 8001 com banco SQLite descartável.
- Observação fora de escopo (não corrigida, não pedida): `frontend/js/api.js` chama
  `/categories`, `/products` e `/skus` com `page_size` de 400/1500/3000, mas o backend limita a
  200 (`Query(..., le=200)`) — pré-existente, gera 400 no console da tela de Relatórios
  independente desta spec.

## Code review (2026-09-12, nível medium)

7 achados reais. Corrigidos e reverificados em runtime (pytest + smoke test browser com 3 cliques
rápidos em "Atualizar marketing"):

- **Bug**: `_low_turnover_rows` classificava SKU com `average_stock=0` e `issued_qty>0` (ruptura de
  item que vendia rápido) como `turnover=0.0` → falso candidato a "baixo giro". Corrigido: quando
  `average_stock<=0`, `turnover=issued_qty` (mesma regra já usada no frontend `reports.js`, agora
  espelhada no backend). Teste novo:
  `test_low_turnover_candidates_excludes_fully_depleted_fast_movers`.
- **Bug**: `campaign_products_report` fazia `LEFT OUTER JOIN` em `StockBalance` mas filtrava
  `branch_id` no `WHERE`, convertendo silenciosamente em `INNER JOIN` — produto sem saldo na
  filial filtrada sumia do relatório em vez de aparecer com `on_hand=0`. Corrigido: filtro de
  `branch_id` movido pra dentro da condição do `JOIN`. Teste novo:
  `test_campaign_products_report_includes_zero_stock_when_branch_filtered`.
- **Bug**: frontend sem guard de sequência de requisição em `refreshMarketingReportsData` — clique
  duplo podia deixar resposta antiga sobrescrever a mais recente. Corrigido com o mesmo padrão
  `refreshSequence` já usado em `refreshReportsData`.
- **Bug**: render duplicado — `.then()` manual chamando `renderReports()`/`renderMarketingReportsCharts()`
  depois de `refreshMarketingReportsData()`, quando `emit()` já dispara re-render via
  `subscribe(() => renderApp())`. Causava rebuild duplo da página inteira e flicker. Corrigido:
  removidas as chamadas `.then()` redundantes, seguindo o mesmo padrão (fire-and-forget) já usado
  por `refreshReportsData`.
- **Melhoria de robustez**: gráficos de `campaignProducts`/`promotionSkus`/`campaigns` sem limite de
  linhas (campanha/promoção com centenas de vínculos deixaria o gráfico ilegível). Adicionado
  `.slice(0, 15)`, mesmo padrão já usado em `lowTurnover`.
- **Simplificação**: campos `campaignProductRows`/`promotionSkuRows`/`campaignRows` retornados por
  `buildMarketingView` mas nunca lidos por `renderMarketingSection` (não há tabela, só gráfico) —
  removidos do objeto de retorno.
- **Não corrigido, documentado**: `_low_turnover_rows` e `_top_skus_by_value` reimplementam a
  mesma fórmula de `stock_turnover`/`stock_abc_report` (endpoints existentes) em vez de reusar —
  decisão consciente de não tocar endpoints existentes fora do escopo desta spec. Risco registrado:
  uma correção futura na fórmula de turnover do endpoint existente não se propaga automaticamente
  pra cá.
