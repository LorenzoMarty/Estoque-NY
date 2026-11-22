# ADR 0008: Keep two repos; share contract by generated types and one board

- Status: **proposed** (needs owner confirmation)
- Date: 2026-11-07
- Related issues: #68 (this ADR), #60, #69, #96

## Context

Catalogo-NY (static React site) and Estoque-NY (FastAPI + React admin) are coupled by the
public API contract (ADR 0001).

## Decision

Stay **polyrepo**. Couple them through the contract, not the filesystem:

- Estoque publishes the OpenAPI schema; Catalogo consumes generated types (#60).
- Contract tests live in Estoque (`tests/contracts`); a staging smoke test checks the site against the API (#69).
- One GitHub Project ("New York") spans both repos; issues carry the `cross-repo` label and a link to their counterpart.

## Consequences

- Independent deploys and permissions; static site stays simple.
- Cross-repo changes need two PRs; the board and the contract tests are what keep them in step.

## Alternatives considered

- Monorepo (pnpm/turbo): atomic cross-repo changes, but merges two deploy pipelines and CI setups for a two-app team. Revisit if cross-repo PR pairs become the norm.

## Assumed / pending

Creating the GitHub Project needs the `project` token scope and the owner's choice of
columns; not done here. Add all open issues of both repos once it exists.
