# ADR 0005: USD base prices, UTC storage, America/Sao_Paulo days

- Status: accepted
- Date: 2026-11-07

## Context

Prices are USD by convention while branches sell in BRL (and UYU/ARS). Reports group by day, and a UTC day is not a Sao Paulo day.

## Decision

- Prices and costs are stored in USD. BRL/UYU/ARS are display currencies only.
- `exchange_rates` holds USD to display rates with `source` and `effective_date`. It is append-only: the API has no update or delete, and there is one rate per currency per date. A new rate never rewrites a past one, so a historic conversion is reproducible with `GET /exchange-rates?on=<date>`.
- Timestamps are stored in UTC. A "day" in a report or alert is an `America/Sao_Paulo` day (`app/domain/lots.py: LOCAL_TZ`); the UI shows that zone.
- Writing rates needs `auth.user.manage`; reading needs `reports.read`.

## Consequences

Converting is a display concern and uses the rate in force on the document date. Syncing rates from an external provider is a follow-up.
