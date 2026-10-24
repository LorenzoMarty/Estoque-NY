# ADR 0001: Catalogo/Estoque contract and data ownership

- Status: **proposed** (2026-10-16). Becomes `accepted` once the owner confirms the open choices below (90-day overlap, 60 s cache, no API key).
- Deciders: Lorenzo Marty
- Related issues: #57 (this ADR), #58 (versioned endpoint), #59 (contract tests), #70 (fallback detection)

## Context

The storefront (**Catalogo-NY**, a static React site) shows products that live in the
inventory system (**Estoque-NY**, FastAPI + Postgres). Until the integration shipped the
site had a hand-edited catalog and drifted from reality. The API now exposes a read-only
feed (`GET /public/catalog`) and the site falls back to a bundled catalog when the API is
slow or down. Before the feed grows (pagination, per-branch availability, promotions,
more fields) the rules need to be written down: who owns what, what is public, how the
contract changes, how it is cached and what happens when it fails.

## Decision

> **What exists today.** `GET /public/catalog` (feed, schema and route in `app/schemas/public.py` and
> `app/api/routes/public.py`) lives on the `feat/redesign-ui` branch. The `/public/v1` prefix, the
> `ETag`/`304`, pagination and the contract snapshot are introduced by #58 and #59; until they
> merge, sections 3 and 4 describe the **target**, not the running behavior.

### 1. Ownership

- **Estoque is the single source of truth** for products, categories, brands, prices,
  stock and publication state. Nothing about a product is edited in Catalogo.
- **Catalogo is a read-only consumer.** It never writes to Estoque and holds no
  credentials: the feed is public and unauthenticated.
- The bundled catalog in Catalogo is a **fallback**, not a second source. It is
  regenerated from the API at build time (#3 of Catalogo-NY) instead of being edited by
  hand.
- Branch-level facts (per-store availability) are published only when explicitly added
  to the contract (see 5); until then the feed carries a single `in_stock` flag.

### 2. What is public and what is not

Public (the whole contract, see `app/schemas/public.py`): product `id`, `name`, `brand`,
`description`, `price_usd`, `price_is_from`, `featured`, `image_url`, `in_stock`, and the
category (`sector`) name.

Branch contact cards (`GET /public/v1/branches`, #125) are public too: `name` (the branch's
`public_name`, not its internal name), `address`, `phone`, `opening_hours` (weekday to
`HH:MM-HH:MM` or null) and `timezone`. A branch is listed only when it has a `public_name`;
clearing it unpublishes the store. The response never carries the internal branch id, the
internal name, costs or quantities.

Never public: cost, SKU codes, barcodes, stock quantities, internal branch names or ids, user or
customer data, anything from `auth`, `audit`, `marketing` administration or reports.
A product appears only if it is `published` **and** `active`. Prices come from SKU
`price` (the lowest positive one, flagged `price_is_from` when SKUs differ); no price
field is stored twice. Adding a field to the feed is a decision about exposure and needs a
note in the pull request.

### 3. Versioning

- The feed lives under a version prefix: `GET /public/v1/catalog`. The unversioned
  `/public/catalog` remains as an alias of v1 so deployed sites keep working.
- Inside a version, changes are **additive only**: new optional fields, never removal,
  rename, retype or a change of meaning of an existing field. Consumers must ignore
  fields they do not know.
- A breaking change ships as `/public/v2` next to v1, and v1 stays for at least 90 days
  after the site moved. The contract snapshot test (#59) fails on any difference, so a
  change is always visible in review; a removed or retyped field requires a new version.

### 4. Caching

- Responses carry `Cache-Control: public, max-age=60, stale-while-revalidate=300` and an
  `ETag`; a request with a matching `If-None-Match` gets `304` with no body.
- The site may cache for the same window. Publication changes can therefore take up to
  about a minute to show; an immediate refresh needs the rebuild/revalidation trigger
  planned in #61.
- Responses stay small: the feed supports `page` / `page_size` so growth does not turn
  into one huge payload.

### 5. Failure behavior

- The site waits at most **4 s** for the feed. On timeout, network error, non-2xx or a
  body that does not parse, it shows the bundled fallback catalog.
- Falling back is **not silent** (#70): the page shows a subtle "data may be out of date"
  hint and the client reports the event, so stale prices or availability are noticed.
  `in_stock` in the fallback is never trusted for ordering decisions.
- The API protects itself with per-IP rate limits on `/public/*` (#3 of Estoque-NY) and
  never returns stack traces or internal ids beyond the product id.

### 6. Images

`image_url` is an absolute `http(s)` URL (validated on write). Serving them from object
storage/CDN rather than from the site bundle is tracked in #64; until then the site must
treat a missing or broken image as normal.

## Consequences

- Prices and availability on the site are at most about a minute stale, never edited
  twice. Operators change data in Estoque and nowhere else.
- Every field exposed is a promise: removal needs a version bump and a 90-day overlap.
- The fallback catalog can still be stale between deploys; that is why the stale hint and
  the build-time refresh exist.
- Contract changes touch two repositories. Estoque holds the schema snapshot; Catalogo
  keeps a copy that its consumer test reads, so a breaking change fails in both.

## Alternatives considered

- **Catalogo keeps its own data** (status quo): simplest, drifts immediately. Rejected.
- **Authenticated feed** (API key in the site): the keys would ship to every browser, so
  they add nothing; rate limiting and a read-only public projection are the real
  protection. Rejected for now.
- **GraphQL / one endpoint per field group**: more flexibility than a catalog of a few
  hundred items needs. Rejected.
- **Monorepo for both projects**: would make contract changes atomic, at the cost of
  moving two deployed repositories; deferred to the discussion in #68.

## Related

- Schema: `app/schemas/public.py`; route: `app/api/routes/public.py`
- Consumer: `Catalogo-NY/src/services/catalogApi.ts`
