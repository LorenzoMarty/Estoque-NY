---
slug: ci-testes-backend
status: done
revision_count: 1
created: 2026-10-04
---

# CI + testes do backend (Estoque-NY)

## Objetivo

Pipeline de CI no GitHub (`LorenzoMarty/Estoque-NY`) e testes do backend cobrindo o domínio
crítico, para que nada seja integrado/deployado sem lint e testes verdes. Primeiro item
implementado do roadmap `roadmap-new-york` (eixo Engenharia).

## Requisitos

- [x] REQ-1: `.github/workflows/ci.yml` roda em push e pull_request para `master`, com dois jobs
  em Linux: backend (Python 3.12: `ruff check`, `ruff format --check`, `pytest`) e frontend
  (`npm ci`, typecheck, `vitest`, build).
- [x] REQ-2: black sai das dev deps e do `pyproject.toml`; `ruff format` vira o formatter único,
  aplicado ao código existente em um commit de reformat separado.
- [x] REQ-3: migration `678cb1a6f4bf` funciona em SQLite: `alembic upgrade head` do zero conclui
  sem erro, e o CI executa essa verificação.
- [x] REQ-4: testes novos para `stock_engine` (movimento, lock/idempotência, estoque negativo
  bloqueado), `transfer_service` (DRAFT→SHIPPED→RECEIVED e transições inválidas) e
  `auth_service` (login, token, usuário inativo).
- [x] REQ-5: `mypy` roda no CI como passo não-bloqueante (`continue-on-error`) se houver erros
  existentes; erros viram follow-up, não parte desta spec.

## Critérios de concluído

- Workflow roda verde no GitHub Actions num push da branch (push feito pelo usuário).
- `pytest` local via `.venv-local` com os testes novos passando.
- `alembic upgrade head` do zero em SQLite sem erro.

## Fora de escopo

- Gate de deploy (Render/Vercel bloqueando em CI vermelho).
- Pre-commit hook.
- `CORS_ORIGINS: "*"` em produção.
- E2E automatizado do frontend.
- Mudanças em regra de negócio do domínio.

## Skills

Ver `.claude/specs/ci-testes-backend/skills-plan.yaml` (gerado pelo `spec-router` após a
aprovação).

## Log da entrevista

- Origem: item "Engenharia" do roadmap `roadmap-new-york` (`NewYork/.claude/specs/`).
- P: Por qual item do roadmap começar? / R: Engenharia: CI + testes do backend.
- P: Formatter do backend, black ou só ruff? / R: Só ruff.
- Suposições declaradas e confirmadas ("sim"): GitHub Actions; pytest com SQLite no CI; push da
  branch para validar o workflow é feito pelo usuário.
- `implement-spec` (2026-10-04): REQ-4 testes novos (`tests/test_stock_engine.py`,
  `test_transfers.py`, `test_auth.py`, `helpers.py`; 21 testes, mutação no `stock_engine` derrubou
  3). REQ-3 migration `678cb1a6f4bf` reescrita com `batch_alter_table` + FKs nomeados
  (`<tabela>_<coluna>_fkey`, SQL Postgres offline equivalente), `now()` -> `func.now()`,
  `sqlite_where` no índice parcial; `tests/test_migrations.py` (falha na migration original).
  REQ-2 black removido de `pyproject.toml`/`uv.lock` (relock em dir temporário por causa do
  `.venv` bloqueado), `ruff format` aplicado em 30 arquivos (ainda sem commit; deve ir em commit
  separado), `docs/README.pt-BR.md` atualizado. REQ-1/5 `.github/workflows/ci.yml` (uv sync
  --frozen; ruff check/format; mypy continue-on-error; pytest; job frontend `npm run build`).
  Verificado local: pytest 44 passed, ruff check/format limpos, `npm run build` ok, YAML válido.
  Pendente: workflow nunca rodou no GitHub (precisa push do usuário); mypy não instalado em
  `.venv-local`, passo não verificado.
- `review-spec` (2026-10-04): REQ-2/3/4/5 atendidos, REQ-1 `[~]` só pelo critério de concluído "verde
  no GitHub Actions", que depende do push do usuário. Evidência: simulei o job de backend numa cópia
  limpa (sem `.venv`) com os comandos do workflow: `uv sync --frozen --python 3.12`, `ruff check`
  e `ruff format --check` limpos, `pytest` 44 passed, `mypy app` roda e acusa 2 erros em
  `app/api/routes/reports.py:365` (não-bloqueante, follow-up conforme REQ-5); `npm run build` do
  frontend ok. Desvios (não bloqueiam): `ruff format` também reformatou arquivos do Fase 4 da outra
  sessão; `docs/README.pt-BR.md` trocou o comando black por ruff; `tests/helpers.py` compartilhado.
  Para fechar: fazer push da branch, ver o workflow verde no Actions e então marcar REQ-1 e
  `status: done`.
- Fechamento (2026-10-04): branch `ci/testes-backend` mesclada em `master` (fast-forward) e enviada.
  Run 37232518006 do workflow CI em `master`: jobs `backend` e `frontend` verdes (ruff, pytest e
  build passam; o `mypy` falha e é ignorado por `continue-on-error`, como previsto no REQ-5).
