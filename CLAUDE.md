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

## Comandos

Gate de verificação (o mesmo do CI, `.github/workflows/ci.yml`):

```bash
# backend (raiz)
uv sync --frozen --python 3.12
uv run ruff check . && uv run ruff format --check .
uv run mypy app        # não bloqueante no CI
uv run pytest -q

# frontend (frontend/)
npm ci && npm run build
```

## Skills e automação

Plugins do marketplace [`lorenzo-skills`](https://github.com/LorenzoMarty/skills), ativados em `.claude/settings.json`.

- Tarefa não trivial começa por `workflow:start`, que escolhe a cadeia: `grill-me` → `write-spec` → `to-tickets` → `implement` → `verify`.
- Specs em `.claude/specs/<slug>/spec.md` (REQ-N, critérios de concluído, log da entrevista).
- Pronto = gate de verificação abaixo verde + relatório do `workflow:verify` no PR.
- **Agente autônomo:** a label `ready-for-agent` numa issue dispara o Claude (`claude.yml`), que implementa com `workflow:implement`, sobe a branch e comenta o link do PR. Issue que precisa de decisão humana recebe `needs-human`.
