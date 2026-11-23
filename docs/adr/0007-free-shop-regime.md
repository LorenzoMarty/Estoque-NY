# ADR 0007: Free-shop (Loja Franca de Fronteira Terrestre) compliance is gated

- Status: **proposed** (blocked on a specialist; this is not legal advice)
- Date: 2026-11-07
- Related issues: #82 (this ADR), #83-#89, epic #98

## Context

The compliance spec (`.claude/specs/compliance-loja-franca/spec.md`) was derived from a
public-source reading of IN RFB 2075/2022. Nobody has confirmed with an accountant or
customs broker that these obligations apply to New York.

## Decision

Assumed, until a specialist answers:

1. **Do not build regime-specific enforcement** (traveler limits #85, Fundaf #86,
   quarterly report #87, RFB/Serpro integration #89) and do not block sales on rules we
   have not validated: a wrong rule is a legal and operational risk.
2. **Allowed without the decision, because they are useful for any retailer:** NCM and
   origin on the SKU (#83, already in the schema), lots with admission date and
   first-expiring-first-out (done), a restricted-category flag (#88) as an informational
   warning, and a stay-period report (#84) that only reports.
3. Anything that **refuses a sale or exports data to the authority** waits for #82.

Questions for the specialist: which obligations apply to New York; limits per traveler
and period; stay-period deadlines; inventory/breakage reporting format and frequency;
whether Serpro integration is mandatory.

## Consequences

- Safe, reversible progress on data foundations; no hard rules baked in prematurely.
- If the regime does not apply, J1-J7 close; if it applies, they reopen with the validated numbers (kept in configuration, not code).

## Alternatives considered

- Implement the full spec now: rejected, legal risk. Drop compliance entirely: rejected, the lot/NCM data is useful anyway.
