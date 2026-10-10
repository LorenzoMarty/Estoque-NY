# Estoque NY

## Contexto no Obsidian

Hub: `[[New York]]` em `02 - Projetos/New York/New York.md` (vault E_Mind), seção **Estoque**.
Arquitetura/Decisões/Registros em `02 - Projetos/New York/Estoque/`.

Ver `README.md` na raiz para stack e setup local/deploy.

## Fluxo Git

- Nada direto em `main`/`master`: uma branch por issue, `tipo/<n>-descricao` (ex.: `feat/12-corretor-v2`).
- Commits e título de PR em Conventional Commits (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`),
  no imperativo e em inglês, como o histórico atual. Um assunto por commit.
- PR segue `.github/pull_request_template.md`, com `Closes #N`; merge por *Squash and merge* (o título vira o commit).
- Issues usam os modelos de `.github/ISSUE_TEMPLATE/` (Feature/Bug), sempre com critério de pronto.
- Todo PR fora de draft recebe review automático do Claude (`claude-review.yml`); responder ou corrigir cada ponto antes do merge.
