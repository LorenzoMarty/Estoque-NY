# ADR 0002: ruff is the only formatter

- Status: accepted
- Date: 2026-10-04

## Context

`black --check` never ran locally on Windows (the application-control policy blocked the package DLL), so format failures only showed up after a push. `ruff` was already the linter and runs the same everywhere, including CI.

## Decision

`ruff format` is the single formatter; black was removed from `pyproject.toml` and `uv.lock`. The CI gate and the pre-commit hooks run `ruff check` and `ruff format --check`.

## Consequences

One tool, same result locally and in CI. One-off cost: 30 files reformatted.

## Alternatives considered

- Keep black in CI only: developers would learn about format failures only after pushing.
