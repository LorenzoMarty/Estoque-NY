# ADR 0003: permission keys are `domain.resource.action`

- Status: accepted
- Date: 2026-09-27

## Context

Catalog (`product.*`, `sku.*`, `category.*`, `brand.*`) and branch/location permissions had no domain prefix, unlike `stock.*`, `marketing.*` and `auth.*`.

## Decision

Rename the persisted `permissions.key` in place with an Alembic data migration. `RolePermission` points at the stable `permission_id`, so no role assignment changes. `branch.*` and `location.*` became `stock.branch.*` and `stock.location.*`, because branch and location ids appear mostly in stock, transfers and inventory. Route URLs did not change.

## Consequences

Every permission follows one pattern. The generic `operator` rule (`startswith("stock.")`) would now match branch and location management, so those two prefixes are excluded explicitly in `ensure_rbac_seed`.

## Alternatives considered

- Keep old and new keys side by side for a while: the same action would be guarded by two permissions, inviting inconsistent authorization.
