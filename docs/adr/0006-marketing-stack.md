# ADR 0006: Marketing stack - own the data, rent the delivery

- Status: **proposed** (needs owner confirmation)
- Date: 2026-11-07
- Related issues: #71 (this ADR), #72-#81

## Context

Estoque already models channels, campaigns, promotions, segments and assets. Open
question: build sending/analytics in-house, adopt SaaS, and whether a `Marketing-NY` repo
is justified.

## Decision

Hybrid, no new repo:

| Concern | Where | Why |
|---|---|---|
| Promotions, price/offer data, segments, consent (LGPD) | Estoque (source of truth) | Tied to stock and the public API (#77, #74) |
| WhatsApp sending and templates | WhatsApp Business API via a BSP (provider chosen by owner) | Meta approval, deliverability, cost per conversation are not worth rebuilding (#75) |
| Email/newsletter sending | Transactional/marketing provider (Resend, Brevo or similar) | Reputation and unsubscribe handling (#76) |
| Web analytics | GA4 or Plausible with the UTM convention (#73) | Commodity |
| Campaign report (UTM to WhatsApp to sale) | Estoque, reading sales and click data (#80) | Needs our sales ledger |

Estoque talks to providers through a thin adapter interface per channel, with a
fake adapter for tests. Marketing UI stays a section of the Estoque front (#37).

## Consequences

- Fast to ship, low fixed cost; recurring SaaS fees and vendor lock-in limited to the adapter.
- Consent records stay with us, so switching provider does not lose opt-ins.
- A separate repo is not justified until marketing has its own deploy cadence or team.

## Alternatives considered

- Build sending in-house: deliverability and Meta policy risk. Rejected.
- All-in-one marketing SaaS (HubSpot etc.): cost per contact and data leaves our control. Rejected for now.
- `Marketing-NY` repo: adds contract overhead (see ADR 0008) with no benefit today.

## Assumed

Provider names are examples; the owner picks them and creates the accounts. Requirements
per channel were derived from the existing issues, not from an interview.
