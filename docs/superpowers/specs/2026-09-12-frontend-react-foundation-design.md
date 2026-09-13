# Frontend Estoque-NY: fundação Vite + React + TypeScript + Mantine

Data: 2026-09-12
Status: aprovado (aguardando review final do usuário)

## Contexto

O frontend atual (`frontend/`) é uma SPA vanilla JS (~24k linhas em `js/*.js`, ~5k
linhas em `css/*.css`) com roteamento hash própria, renderização manual via DOM
(`render.js`), estado global custom (`state.js`) e cliente HTTP próprio
(`api.js`, 4544 linhas). O Vite já está configurado (`vite.config.mjs`,
`package.json`) mas apenas para servir os módulos JS puros — não há React.

Decisão do usuário: rewrite completo para React + TypeScript (não migração
incremental tela-por-tela). Dado o tamanho do app (13 telas de domínio), este
projeto é decomposto em sub-projetos:

1. **Esta spec — Fundação**: scaffold, shell, auth, roteamento, tema, client
   HTTP, config de deploy. Sem telas de domínio.
2. **Specs futuras, uma por domínio**: dashboard, products/variations,
   movements, transfers, inventory_counts, reports, users/permissions,
   cadastros, audit, marketing. Cada uma entra em brainstorming própria depois
   que a Fundação estiver implementada e validada.

## Stack decidida

- Build: Vite (já presente) + `@vitejs/plugin-react`
- Linguagem: TypeScript
- UI: Mantine (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`,
  `@mantine/charts`)
- Data fetching / cache de servidor: TanStack Query (`@tanstack/react-query`)
- Tabelas: TanStack Table (`@tanstack/react-table`), renderizada com
  componentes Mantine (`Table`)
- Formulários: React Hook Form + Zod (`@hookform/resolvers/zod`) — sem
  `@mantine/form`, para não ter dois padrões de formulário coexistindo
- Estado global de UI/auth (fora do servidor): Zustand
- Roteamento: `react-router` (v6+), paths normais (`/dashboard`, não mais
  `#/dashboard`)
- Gráficos: `@mantine/charts` (substitui Chart.js vendorizado)

## Escopo desta spec (Fundação)

### 1. Estrutura de pastas

Por feature/domínio, não por camada:

```
frontend/src/
  app/
    App.tsx              # providers (QueryClient, MantineProvider, Router)
    router.tsx            # definição de rotas + RequireAuth
    theme.ts               # tema Mantine mapeado do app.css atual
    shell/
      AppShell.tsx          # sidebar + topbar + outlet (equivalente a render.js do shell)
      Sidebar.tsx
      Topbar.tsx
  features/
    auth/
      api.ts                # login, refresh, logout — chamadas HTTP
      store.ts               # Zustand: token, user, isAuthenticated
      LoginPage.tsx
    <cada domínio futuro fica aqui: products/, movements/, ...>
  shared/
    api/
      httpClient.ts          # fetch wrapper tipado, base URL, bearer, interceptor 401/403
      demoFallback.ts         # fallback pra mock em erro 5xx (equivalente ao "mode: demo" atual)
    ui/
      # componentes genéricos reaproveitáveis entre features (quando surgirem)
    strings.ts                # ex-i18n.js: dicionário pt-BR fixo, tipado (não é lib de i18n real)
    types/
      api.ts                  # tipos TS dos payloads da API (a partir das rotas em app/api/routes)
  main.tsx                    # entry point (substitui src/main.js atual)
```

`frontend/js/*.js` (legado) é removido só quando a última tela migrar; durante
a Fundação ele fica intacto mas sem ser importado por `index.html` (index.html
passa a apontar só pra `src/main.tsx`).

### 2. Roteamento e guard de auth

- `react-router` com `createBrowserRouter`, paths normais.
- `RequireAuth`: componente wrapper que redireciona pra `/login` se não houver
  token válido no store Zustand — equivalente ao `syncRouteWithHash` +
  `PUBLIC_ROUTES` atual em `main.js`.
- Rotas de domínio (dashboard, products, etc.) entram como rotas placeholder
  (`<div>em migração</div>`) nesta fundação, substituídas quando cada spec de
  domínio for implementada.

### 3. Cliente HTTP e dados

- `httpClient.ts`: wrapper `fetch` tipado. Mantém:
  - `API_BASE_URL` resolvido igual hoje (`window.__API_BASE_URL__` → env Vite
    → default local `http://127.0.0.1:8000`)
  - Token JWT em `localStorage` (mesmas chaves de hoje, ver `AUTH_STORAGE_KEYS`
    em `api.js`)
  - Em 401/403: dispara evento (ou callback no store Zustand) que limpa sessão
    e redireciona pra `/login` — equivalente ao `AUTH_REQUIRED_EVENT_NAME`
  - Em erro 5xx/timeout: possibilidade de fallback pra dados mock (modo
    demonstração), preservando o comportamento atual — mecanismo concreto
    (query `placeholderData`/`onError` do TanStack Query vs. dado direto do
    client) fica a critério da implementação, desde que o toast e o
    comportamento visual de hoje sejam preservados.
- Hooks TanStack Query por feature (`useProductsQuery`, etc.) são criados nas
  specs de domínio futuras — a Fundação só entrega o `QueryClient` provider e
  o `httpClient` genérico.

### 4. Tema visual

- `theme.ts`: objeto de tema Mantine (cores, radius, spacing, fontFamily)
  extraído de `app.css`/`responsive.css` para preservar o visual atual
  (sidebar escura, cards, paleta). Não é redesign — é tradução de tokens CSS
  existentes para a API de tema do Mantine.
- Fonte `Inter` (já carregada via Google Fonts no `index.html`) mantida.

### 5. Strings

- `i18n.js` (1583 linhas) é dicionário fixo pt-BR, não i18n multi-idioma real.
  Migra para `shared/strings.ts`, objeto TS tipado (mesma estrutura de chaves),
  sem introduzir lib de i18n.

### 6. Deploy (mudança de fluxo — não silenciosa)

Build agora gera `frontend/dist/` (Vite build) em vez de arquivos estáticos
soltos (`js/`, `css/`, `vendor/`). Roteamento com paths normais exige fallback
SPA no host. Arquivos afetados:

- `scripts/prepare_vercel_static.py`: passa a rodar `npm ci && npm run build`
  dentro de `frontend/` e copiar `frontend/dist/*` para `public/` (em vez de
  `index.html`, `css`, `js`, `vendor` soltos).
- `vercel.json`: adiciona rewrite catch-all para servir `index.html` em rotas
  que não sejam `/api/*` (necessário para paths do react-router funcionarem
  em refresh/deep-link).
- Render (Static Site): `Publish Directory` passa de `.` para `frontend/dist`;
  adicionar `frontend/public/_redirects` com `/* /index.html 200` (Vite copia
  `public/` pra `dist/` automaticamente).
- `frontend/Dockerfile`: passa a ter build stage (`npm ci && npm run build`)
  e servir `dist/` (ex.: via `vite preview` ou servidor estático simples),
  em vez de copiar `js/css/vendor` soltos e rodar `npm run dev`.
- README: seção de deploy (Vercel/Render/Docker) atualizada para refletir os
  itens acima.

### 7. Testes

- `npm run test` continua existindo mas passa a rodar `tsc --noEmit` (type
  check) em vez do `test-frontend.mjs` atual (validação de sintaxe JS —
  torna-se redundante com TS).
- Verificação em runtime obrigatória antes de fechar a Fundação: `npm run dev`
  de fato sobe, login funciona contra a API local (ou cai no modo demo em
  erro), navegação entre rotas placeholder funciona, build (`npm run build`)
  não quebra.

## Fora de escopo (fica para specs de domínio)

- Qualquer tela de negócio (dashboard, produtos, movimentações, transferências,
  contagem de estoque, relatórios, usuários/permissões, cadastros, auditoria,
  marketing/catálogo, variações).
- Migração dos gráficos (Chart.js → `@mantine/charts`) além do provider base —
  o gráfico real de cada relatório é implementado na spec de "reports".
- Tabelas com TanStack Table — a primeira tela com listagem/paginação real
  define o padrão reutilizável.
- Remoção definitiva de `frontend/js/*.js` legado (só remove quando todas as
  telas migrarem).

## Riscos e mitigação

- **Deploy quebrado em produção durante a transição**: mitigado testando
  `npm run build` + preview local do `dist/` antes de qualquer push, e
  ajustando `vercel.json`/Render/Dockerfile na mesma entrega da Fundação (não
  depois).
- **Divergência visual do tema Mantine vs. app.css atual**: mitigado com
  checagem visual manual (screenshot comparando shell atual vs. novo) antes de
  considerar a Fundação concluída.
