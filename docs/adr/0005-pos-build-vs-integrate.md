# ADR 0005: Sales ledger in Estoque, no full POS (yet)

- Status: **proposed** (needs owner confirmation; see "Assumed")
- Date: 2026-11-07
- Deciders: Lorenzo Marty
- Related issues: #30 (this ADR), #31, #32, #33, #34, #35, #36, #44

## Context

Estoque has no `Sale` or `Customer`. Stock only decreases through manual movements, so
balances drift from reality and "best sellers" cannot be real. The five branches sell
today on tools we have not inventoried. The choice shapes the whole Sales epic (#93).

## Decision

**Build a minimal sales ledger inside Estoque and feed it two ways; do not build a
cash-register POS now.**

1. `Customer` (with LGPD consent, #31) and `Sale`/`SaleItem` (#32), each sale linked to a
   stock `ISSUE` and idempotent via `Idempotency-Key`.
2. An import path (API and CSV, #33) for whatever POS or spreadsheet a branch already uses.
3. A simple "register a sale" screen (#44) for branches without a POS. It is a form over
   the ledger, not fiscal software (no NFC-e, no payment terminal, no cash drawer).

Fiscal emission and payments stay with the branch's existing tool or a future integration.

## Consequences

- Stock becomes accurate as soon as sales are imported; best sellers (#34) and daily close
  (#35) get real data.
- We own a small, well-tested domain instead of a fiscal product we cannot maintain.
- If a branch needs fiscal emission, it keeps its POS and we import from it; revisit this
  ADR if two or more branches have no usable POS.
- Epic labels: #32/#33 stay P1; #35/#36/#44 stay P2 and depend on the ledger only.

## Alternatives considered

- Full in-house POS (fiscal, payments, offline): months of work, regulatory exposure, no
  differentiation. Rejected.
- Adopt an existing ERP/POS and make Estoque a read-only mirror: loses the single source of
  truth set in ADR 0001 and costs a license per branch. Rejected for now.
- Do nothing (manual movements only): stock stays wrong. Rejected.

## Assumed

The inventory of how each branch sells today (issue scope bullet 1) was **not** done; it
needs the owner. The decision above is the one that stays valid for most outcomes.
