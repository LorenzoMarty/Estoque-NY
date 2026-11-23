# UTM convention

Related: #73, #79, #80. Proposed; the owner confirms the analytics provider (GA4 or Plausible, see ADR 0006).

## Rules

All lowercase, ASCII, words separated by `-`, no spaces, no accents.

| Param | Meaning | Allowed values / pattern |
|---|---|---|
| `utm_source` | where the click comes from | `instagram`, `facebook`, `whatsapp`, `google`, `gbp` (Google Business Profile), `email`, `qr`, `flyer` |
| `utm_medium` | channel type | `social`, `organic`, `cpc`, `broadcast`, `newsletter`, `print`, `offline` |
| `utm_campaign` | campaign slug `YYYY-MM-name` | `2026-12-natal`, `2026-11-black-friday` |
| `utm_content` | creative or placement | `story-1`, `shelf-a3`, `banner-top` |
| `utm_term` | paid keyword only | optional |
| `branch` (extra) | branch public slug | `centro`, `fronteira` |

Campaign slugs should match campaigns registered in Estoque, so a link never uses a
campaign that does not exist.

## Examples

- Instagram story: `?utm_source=instagram&utm_medium=social&utm_campaign=2026-12-natal&utm_content=story-1`
- QR on a shelf: `?utm_source=qr&utm_medium=offline&utm_campaign=2026-12-natal&utm_content=shelf-a3&branch=centro`
- WhatsApp broadcast: `?utm_source=whatsapp&utm_medium=broadcast&utm_campaign=2026-11-black-friday`

## Attribution to a sale

WhatsApp click-to-chat links carry `ref:<campaign>/<content>` in the prefilled text, so the
attendant (or the sales import, #33) records the campaign on the sale. Report in #80.

## Open (owner)

Pick the analytics provider, create the property and add the snippet to Catalogo-NY.
