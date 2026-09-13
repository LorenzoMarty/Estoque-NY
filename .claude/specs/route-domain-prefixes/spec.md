---
slug: route-domain-prefixes
status: done
revision_count: 1
created: 2026-09-12
---

# Reorganização de rotas por domínio (Fase 3 do roadmap admin-api)

## Objetivo

Implementar a Fase 3 de `docs/admin-api-roadmap.md`: mover rotas soltas (sem prefixo de domínio)
para debaixo do domínio correto (`/catalog`, `/admin`), com corte limpo — rota antiga deixa de
existir, sem manter os dois paths em paralelo. `/stock`, `/marketing`, `/reports/stock`,
`/reports/marketing` e `/auth` já usam prefixo de domínio correto, não precisam de mudança.

## Requisitos

- [x] REQ-1: `app/api/routes/catalog.py` — `APIRouter(tags=["catalog"])` ganha
  `prefix="/catalog"`. Rotas `/categories*` e `/brands*` passam a `/catalog/categories*` e
  `/catalog/brands*`.
- [x] REQ-2: `app/api/routes/products.py` — prefixo muda de `/products` para `/catalog/products`.
- [x] REQ-3: `app/api/routes/skus.py` — prefixo muda de `/skus` para `/catalog/skus`.
- [x] REQ-4: `app/modules/audit/router.py` — `APIRouter(tags=["audit"])` ganha `prefix="/admin"`.
  Rota `/audit-logs` passa a `/admin/audit-logs`.
- [x] REQ-5: `/branches`, `/locations`, `/stock/*`, `/marketing/*`, `/reports/stock`,
  `/reports/marketing`, `/auth/*` permanecem inalterados (fora de escopo desta fase).
- [x] REQ-6: `frontend/js/api.js` — todas as chamadas (`requestJson`/`optionalJson`/
  `loadPagedCollection`) para `/categories`, `/brands`, `/products`, `/skus`, `/audit-logs`
  atualizadas para os novos paths com prefixo.
- [x] REQ-7: `tests/test_admin_entities.py` e `tests/test_reports_marketing.py` atualizados pros
  novos paths.
- [x] REQ-8: comentários de doc desatualizados citando os paths antigos atualizados em
  `frontend/js/{main,products,reports,inventory_counts,transfers,audit}.js`.
- [x] REQ-9: path antigo (sem prefixo de domínio) não responde mais (404) — sem dual-path, sem
  header de deprecation.
- [x] REQ-10: nenhuma rota nova sob `/api/v1`.

## Critérios de concluído

- `uv run pytest` passa completo (paths novos).
- `uv run ruff check app tests migrations` sem erros.
- `npm run test` (frontend) sem erros.
- Smoke test real no browser: telas de Produtos, Variações, Cadastros (categorias/marcas),
  Relatórios e Auditoria carregam e funcionam normalmente contra as rotas renomeadas.
- Nenhuma referência residual aos paths antigos no repo (`grep` limpo em `frontend/js/api.js` e
  nos testes).

## Fora de escopo

- `/api/v1`.
- `/admin/users`, `/admin/roles` (não existem como CRUD dedicado ainda — só `/auth/roles/assign`).
- `/reports/catalog`, `/reports/overview` (tipos de relatório novos, não implementados).
- Reorganizar `/branches`/`/locations` (roadmap não menciona, usuário optou por deixar como está).
- Fase 4 (governança).

## Skills

Ver `.claude/specs/route-domain-prefixes/skills-plan.yaml`.

## Log da entrevista

- P: Quais domínios ganham alias/reorganização agora? / R: Todos que precisam — na prática só
  `/catalog` (categories/brands/products/skus) e `/admin` (audit-logs), já que `/stock`,
  `/marketing` e `/reports` já usam prefixo de domínio correto.
- P: `/branches`/`/locations` não estão na lista-alvo do roadmap — onde entram? / R: Ficam soltas,
  sem alias.
- P: Introduzir `/api/v1` já? / R: Não agora.
- P: Rotas legadas — manter as duas ou remover a antiga? / R: Remove e corrige o que precisar —
  corte limpo, sem manter path antigo.

## Log de implementação (2026-09-12)

- Mapeamento prévio confirmou blast radius pequeno: toda chamada HTTP real do frontend passa por
  `frontend/js/api.js` (arquivo único) — os demais arquivos só tinham comentários de doc citando
  os paths antigos.
- TDD: testes atualizados pros paths novos primeiro (RED — 404 confirmado contra backend ainda não
  alterado), depois prefixo renomeado nos 4 routers (GREEN). `uv run pytest`: 13 passed. `ruff`:
  limpo. `npm run test` (frontend): limpo.
- 24 substituições em `api.js` + comentários de doc em `main.js`, `products.js`, `reports.js`,
  `inventory_counts.js`, `transfers.js`, `audit.js`.
- Verificação em runtime: backend isolado (porta 8002, SQLite descartável) confirmou via curl que
  `/catalog/*` e `/admin/audit-logs` respondem e os paths antigos (`/products`, `/skus`,
  `/categories`, `/brands`, `/audit-logs`) devolvem 404. Smoke test real no browser (Playwright):
  login, Produtos (dado real criado via API aparece na tela), Cadastros, Relatórios, Variações —
  todas funcionando contra as rotas novas, sem erro novo introduzido.
- Achado durante o smoke test (pré-existente, não corrigido, mesma classe do achado já registrado
  na spec `reports-marketing-cross`): `frontend/js/api.js` também pede `page_size` acima do
  limite do backend (`le=200`) em `/admin/audit-logs` (250) e agora visível também em
  `/catalog/skus` (250/600/1200/1500/3000) e `/catalog/products` (600/1500) — dispara o modo demo
  já existente nessas telas (Variações, Auditoria, Produtos com filtros amplos). Confirmado que é
  pré-existente (mesmo comportamento ocorreria no path antigo) via `git diff`, não introduzido por
  esta spec.
- Achado externo, não relacionado a esta tarefa: `frontend/index.html` e `frontend/css/app.css`
  tinham mudança em andamento por processo externo à sessão (skip-link, `meta theme-color`, +507
  linhas de CSS, depois aparente início de migração pra bundler) durante o trabalho — identificado
  e deixado intacto, fora do commit desta spec.
- Code-review (nível medium, rodado em background) achou 1 referência esquecida: comentário de doc
  em `frontend/js/variations.js:4` ainda citava `/skus`/`/products` antigos — único arquivo que
  ficou de fora da varredura manual do REQ-8. Corrigido para `/catalog/skus`/`/catalog/products`.
  Sem impacto funcional (comentário), mas confirmava exatamente o tipo de erro que o code-review
  foi pedido pra achar.
