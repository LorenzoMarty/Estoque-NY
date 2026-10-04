---
slug: redesign-ui-estoque
status: done
revision_count: 1
created: 2026-10-04
---

# Redesign UI/UX do Estoque (frontend)

## Objetivo

Reestilizar todo o frontend do Estoque-NY com o layout e os componentes da referência Behance
(ERP Inventory Management Dashboard), mantendo a marca azul e o tema claro atuais. Nenhuma
mudança no backend. Item "UI/UX" do roadmap `roadmap-new-york`.

## Requisitos

- [x] REQ-1: Shell. Sidebar com item ativo escuro e ícones, e topbar com busca, no estilo da
  referência. A navegação e as rotas atuais continuam iguais.
- [x] REQ-2: Tema. Tokens do tema (cores semânticas de status, raios, sombras, tipografia)
  centralizados em `app/theme.ts`, de modo que as telas herdem o visual sem estilo solto repetido.
- [x] REQ-3: Componentes compartilhados em `shared/ui`: card de KPI com variação percentual, pill
  de status e tabela estilizada. As telas passam a usá-los.
- [x] REQ-4: Dashboard. KPI cards, gráfico de barras de entradas vs. saídas, donut de categorias e
  tabela de movimentações recentes com abas. Tudo calculado com dados que já existem na API; sem
  métricas inventadas (lucro e faturas da referência não existem no sistema).
- [x] REQ-5: Produtos. Barra de resumo de estoque (em estoque, baixo, sem estoque), tabela com pill
  de status e alternância para grid de cards. Imagem de produto não existe no backend, então os
  cards usam placeholder.
- [x] REQ-6: Demais telas (movimentações, transferências, contagens, relatórios, cadastros,
  usuários, auditoria) aplicam o mesmo visual: cabeçalho de página, tabelas, filtros e pills.
- [x] REQ-7: Os testes existentes continuam passando e `npm run build` (typecheck, vitest, vite
  build) segue verde, sem dependência nova.

## Critérios de concluído

- `npm run build` verde.
- Smoke no browser (backend com banco temporário) passando por todas as telas sem erro de console.
- Screenshots do dashboard e de produtos para o usuário revisar.

## Fora de escopo

- Paleta nova (ciano/preto) e modo escuro.
- Novos endpoints ou campos no backend (imagem de produto, "pre-order", faturas).
- Responsividade mobile além do que já existe.
- Redesign da tela de login.

## Skills

Ver `.claude/specs/redesign-ui-estoque/skills-plan.yaml` (gerado pelo `spec-router`).

## Log da entrevista

- Origem: item "UI/UX do Estoque" do roadmap `roadmap-new-york`; referência
  https://www.behance.net/gallery/236691173/ERP-Inventory-Management-Dashboard-UIUX-Design
- P: Quais telas entram na primeira spec? / R: Todas as telas de uma vez.
- P: Quanto da identidade visual entra? / R: Layout e componentes, mantendo o azul atual.
- Suposições declaradas e confirmadas ("sim"): "Low Stock" usa ponto de reposição se o backend
  tiver, senão limite fixo declarado no código; spec no repo Estoque-NY; implementação numa branch,
  sem push sem o usuário pedir.
- `implement-spec` (2026-10-04, branch `feat/redesign-ui`, sem commit): shell (sidebar com item ativo
  escuro, topbar com busca), tokens em `app/theme.ts` (`statusTones`, sombras, defaults de Badge/Card/Table)
  e `css/redesign.css`; componentes `shared/ui` (KpiCard, StatusPill, PageHeader, DataTable);
  Dashboard com 6 KPIs, barras entradas vs saídas, donut por categoria e movimentações com abas;
  Produtos com barra de resumo de estoque, situação por produto e alternância lista/cards; as demais
  8 telas migradas para PageHeader/DataTable/StatusPill. Lógica nova com testes: `shared/stock`,
  `shared/moveTypes`, `dashboard/charts`, `products/stock`, `shared/ui/components`.
  Verificado: `npm run build` exit 0 (typecheck, 86 testes vitest, vite build); smoke no browser com
  backend SQLite temporário em 10 telas, 0 erros de console, sem overflow horizontal. Auditoria de
  contraste (WCAG 1.4.3): 5 falhas achadas e corrigidas no CSS (subtítulos/dimmed, rótulos de seção,
  pill de aviso, pill de sucesso, aba ativa). Screenshots em `NewYork/.playwright-mcp/` (before-dashboard,
  after-dashboard-1, after-produtos-list, after-produtos-grid, final-*).
  Sem dependência nova. Limite de "Estoque baixo" é fixo (`REORDER_POINT = 12` em `shared/stock.ts`),
  pois o backend não tem ponto de reposição por item. Marca do produto aparece "—" porque a API
  devolve `brand` nulo (comportamento anterior, não alterado). Gráfico sem visão em tabela (a tabela
  abaixo mostra movimentações, não os agregados do gráfico): sugestão para spec futura.
- `review-spec` (2026-10-04): REQ-1 a REQ-7 atendidos. A revisão achou 2 desvios e corrigiu antes de aprovar:
  (1) REQ-2: as cores de status estavam duplicadas em hex no `redesign.css`; agora a paleta fica em
  `statusPalette` (`app/theme.ts`) e chega ao CSS como `--status-*` via `cssVariablesResolver`, confirmado
  no browser (barra de estoque rgb(12,163,12)/(250,178,25)/(208,59,59)); (2) REQ-6: `CountDetailModal`
  ainda usava `Badge` cru; agora usa `StatusPill` com os mapas de `inventory-counts/status.ts` (verificado
  abrindo o modal de uma contagem real: pill "Aberta"). Evidência final: `npm run build` exit 0 com 87 testes;
  smoke de 10 telas com 0 erros de console. Desvios sem bloqueio: adicionada `PageHeader` em Auditoria e
  Cadastros (que não tinham o cabeçalho padrão); texto do campo de busca do topbar mudou para "Buscar ou ir
  para…" (abre a paleta de comandos, não há busca global nova). Pendente do usuário: commit/push da branch
  `feat/redesign-ui` e revisão visual dos screenshots em `NewYork/.playwright-mcp/`.
