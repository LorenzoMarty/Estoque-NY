---
slug: reactbits-ui-estoque
status: done
revision_count: 1
created: 2026-10-04
---

# Cores e animações (React Bits) no frontend do Estoque

## Objetivo

Melhorar a paleta (azul e branco como identidade) e adicionar animações do React Bits ao frontend do
Estoque-NY. Sem mudança de dados nem de backend. Continuação de `redesign-ui-estoque`, na mesma branch
(`feat/redesign-ui`).

## Requisitos

- [x] REQ-1: Paleta "azul profundo". Primária `#2563eb` (hover `#1d4ed8`), tinta `#e8f0fe`, fundo da
  página `#f4f8ff`, superfície branca, borda `#dbe6f7`, texto `#0b1b33` e secundário `#4a5d7a`, item
  ativo da sidebar `#0b1b33`. Definida uma vez em `app/theme.ts` e exposta ao CSS por variáveis;
  `redesign.css` deixa de ter azuis e cinzas soltos.
- [x] REQ-2: Contraste. Todo texto sobre a primária e sobre as tintas chega a 4,5:1 (medido no DOM).
- [x] REQ-3: Gráficos. O azul das séries passa a `#2563eb`; o par azul + laranja é revalidado com o
  validador de paleta (adjacência e daltonismo) antes de aplicar.
- [x] REQ-4: CountUp nos KPIs do dashboard. O número sobe animado ao carregar e não reanima sem mudança
  de valor.
- [x] REQ-5: SpotlightCard nos cards de KPI e de produto.
- [x] REQ-6: AnimatedList nas movimentações recentes do dashboard, mantendo `<table>`, paginação e abas.
- [x] REQ-7: Fundo DotGrid só na tela de login, com formulário legível e contraste mantido.
- [x] REQ-8: Movimento reduzido. Com `prefers-reduced-motion: reduce` nada anima (CountUp mostra o valor
  final, lista e cards estáticos, fundo com pontos fixos).
- [x] REQ-9: Os componentes do React Bits entram como código copiado em `src/shared/reactbits/`
  (TypeScript + CSS puro). Dependências novas no `package.json`: só `motion` e `gsap`.
- [x] REQ-10: Testes existentes seguem passando. Os testes de `theme.test.ts` que fixam a paleta antiga
  (`#3b82f6`, `#f5f9ff`) são atualizados para os valores novos; `npm run build` verde e tamanho do bundle
  reportado antes e depois.

## Critérios de concluído

- `npm run build` verde.
- Smoke no browser nas 10 telas sem erro de console, com login e dashboard verificados em movimento
  normal e reduzido.
- Contraste medido de novo no DOM.
- Screenshots antes e depois.

## Fora de escopo

- Outros componentes do React Bits (cursores, textos animados, fundos no app).
- Modo escuro e a paleta ciano/preta da referência.
- Backend.
- Redesign do formulário de login além do fundo.

## Skills

Ver `.claude/specs/reactbits-ui-estoque/skills-plan.yaml` (gerado pelo `spec-router`).

## Log da entrevista

- Pedido: usar https://reactbits.dev/ para melhorar a UI; depois, melhorar as cores mantendo azul e branco.
- Catálogo e dependências conferidos no repositório DavidHDev/react-bits: CountUp e AnimatedList usam
  `motion`; SpotlightCard e BorderGlow não têm dependência; DotGrid usa `gsap` (+ InertiaPlugin); Aurora
  usa `ogl`. Nenhuma estava instalada no frontend.
- P: Quais componentes entram? / R: CountUp nos KPIs, SpotlightCard/BorderGlow nos cards, AnimatedList nas
  movimentações e fundo animado no login.
- P: Qual fundo para o login? / R: DotGrid.
- P: Qual direção de cor? / R: Azul profundo.
- Suposições declaradas e confirmadas ("Sim"): mesma branch `feat/redesign-ui` sem commit nem push;
  licença MIT + Commons Clause permite uso interno; `InertiaPlugin` vem no `gsap` público (confirmar na
  instalação).
- `implement-spec` (2026-10-04, branch `feat/redesign-ui`, sem commit): paleta "azul profundo" em `palette`
  (`app/theme.ts`), derivada para as rampas Mantine e para variáveis `--rd-*` via `cssVariablesResolver`;
  `redesign.css` remapeia as variáveis legadas (`--zinc-*`, `--orange-*`) para `--rd-*` e troca o fundo
  acinzentado do `html`/`.app-shell`/`body` (vinha de gradientes e de `#eef2f7` do CSS legado) por `--rd-page`.
  Componentes copiados em `src/shared/reactbits/`: `CountUp`, `SpotlightCard`, `DotGrid`, `AnimatedRow` e o hook
  `useReducedMotion`. `package.json`: só `motion@14` e `gsap@3.15` (InertiaPlugin vem no pacote público).
  Aplicação: CountUp e SpotlightCard no `KpiCard`; SpotlightCard nos cards de produto; AnimatedRow nas linhas das
  movimentações recentes (só na primeira carga, não em troca de página/aba); DotGrid de fundo no login.
  Desvios da letra da spec: (1) o `AnimatedList` do React Bits não foi copiado: ele lista strings e captura
  Tab/setas na janela inteira; a animação de entrada dele (`AnimatedItem`) foi derivada para `<tr>`
  (`AnimatedRow`), mantendo `<table>`, paginação e abas; (2) o CountUp usa animação de duração fixa com a curva
  `[0.2,0,0,1]` em vez da mola do original, que parava em 1.485 em vez de 1.500; (3) `DotGrid` e `CountUp` foram
  adaptados (movimento reduzido, limpeza de tweens, valor final para leitores de tela).
  Verificação: `npm run build` exit 0 com 95 testes; smoke de 10 telas x 2 modos de movimento (normal e reduzido)
  com 0 erros de console e sem overflow; CountUp medido em runtime (43, 846, 1.245, 1.402, 1.499, 1.500 em ~0,9 s);
  login e KPI com movimento reduzido sem animação; paleta revalidada (`validate_palette.js`, 5 slots passam, par
  azul/laranja ΔE CVD 29,9); contraste medido no DOM: tudo >= 4,5:1, com 1 falha achada e corrigida (placeholder
  1,95 -> 5,41). Bundle JS 2.082,62 -> 2.302,94 kB (+220 kB; gzip 581,25 -> 657,70 kB, +13%), CSS +1,4 kB.
  (A frase "não observado em browser" desta entrada foi resolvida na revisão abaixo.)
- `review-spec` (2026-10-04): REQ-1 a REQ-10 atendidos. A revisão refez a verificação em runtime e achou 2
  defeitos, ambos corrigidos antes de aprovar: (1) a entrada das linhas (REQ-6) nunca tocava para quem não
  tinha a tabela na tela nos primeiros 0,8 s: um timer trocava as linhas por versões simples antes de o
  usuário rolar até elas (e isso escondeu o problema nas medições anteriores); o timer foi trocado por um
  gatilho "última linha terminou de entrar" (`onEntered` em `AnimatedRow`); (2) sobraram cores da paleta
  antiga: sombra do item ativo da sidebar (navy `15,31,54`) e brilho do SpotlightCard (azul fixo), agora
  derivados de `--rd-ink` e `--rd-primary`. Evidência pós-correção: linhas abaixo da dobra ficam em opacidade 0
  até entrarem na tela, depois sobem em onda (0,25 → 0,73 → 0,90 por linha, terminando em ~0,4 s); trocar de
  página ou de aba não repete a entrada; CountUp animou ao trocar o filtro de filial e terminou exatamente em
  740, igual ao valor lido por leitor de tela; brilho do SpotlightCard seguiu o ponteiro com a cor da
  primária. `npm run build` exit 0, 95 testes, bundle JS 2.302,92 kB. Nota de ambiente: o browser de teste
  ficou com ~1 quadro por 500 ms depois de muitas execuções e as medições dessa janela foram descartadas;
  repeti numa página nova (31 quadros).
  Desvios sem bloqueio: o AnimatedList do React Bits não foi usado (substituído pelo AnimatedRow, ver acima);
  `PageHeader` e demais mudanças de tema atingem as 10 telas, não só as citadas.
