# Roles and permissions per branch

Who can do what, and where. Regenerate the table with
`python -c "from app.core.role_matrix import render_matrix_markdown as r; print(r())"`;
`tests/test_role_matrix.py` fails when this file drifts from `app/core/role_matrix.py`.

## How a request is judged

1. **Admin** can do everything in every branch.
2. Everyone else only reaches the branches listed in `user_branches` (a user with no
   rows sees nothing). Manage them in *Usuários > Filiais* or with
   `PUT /auth/users/{id}/branches`.
3. In a branch where the user was given a **role**, that role's permissions apply and
   the user's global roles are ignored *for that branch*. In a branch without a role,
   the global roles apply, as before.
4. A branch role only counts on **branch-aware** endpoints (stock, transfers, inventory counts, branches,
   locations and the stock/marketing reports that filter by branch). Global endpoints (catalog, marketing
   administration, audit, users) judge the user's **global roles only**, so a manager in one branch
   cannot edit the shared catalog. A branch the user cannot use answers `403 no access to branch N`; one
   where the role is too weak answers `403 your role in branch N does not allow <permission>`.

Branch roles: `manager`, `stockkeeper`, `seller`, `auditor`. `admin` is global only.
The existing global roles (`admin`, `stock_operator`, `viewer`) are unchanged.

## What each branch role is for

| Role | Meant for | Can |
|---|---|---|
| `seller` | Counter staff | Issue stock (sales), read balances, moves, transfers, catalog and promotions |
| `stockkeeper` | Stock room | Everything a seller can, plus receipts, adjustments, transfers (create, ship, receive, cancel), inventory counts and barcodes |
| `manager` | Branch manager | Everything a stockkeeper can, plus catalog and location maintenance, marketing, stock and marketing reports and the audit log. **Cannot** manage users, or create, edit or delete branches |
| `auditor` | Review, accounting | **Read-only everywhere**: only `*.read` permissions, no write, ship, receive or cancel |

## Matrix

| Permission | manager | stockkeeper | seller | auditor |
|---|:-:|:-:|:-:|:-:|
| `stock.branch.create` |  |  |  |  |
| `stock.branch.read` | ✓ | ✓ | ✓ | ✓ |
| `stock.branch.update` |  |  |  |  |
| `stock.branch.delete` |  |  |  |  |
| `stock.location.create` | ✓ |  |  |  |
| `stock.location.read` | ✓ | ✓ | ✓ | ✓ |
| `stock.location.update` | ✓ |  |  |  |
| `stock.location.delete` |  |  |  |  |
| `catalog.category.create` | ✓ |  |  |  |
| `catalog.category.read` | ✓ | ✓ | ✓ | ✓ |
| `catalog.category.update` | ✓ |  |  |  |
| `catalog.brand.create` | ✓ |  |  |  |
| `catalog.brand.read` | ✓ | ✓ | ✓ | ✓ |
| `catalog.brand.update` | ✓ |  |  |  |
| `catalog.brand.delete` |  |  |  |  |
| `catalog.product.create` | ✓ |  |  |  |
| `catalog.product.read` | ✓ | ✓ | ✓ | ✓ |
| `catalog.product.update` | ✓ |  |  |  |
| `catalog.sku.create` | ✓ |  |  |  |
| `catalog.sku.read` | ✓ | ✓ | ✓ | ✓ |
| `catalog.sku.update` | ✓ |  |  |  |
| `catalog.sku.barcode.create` | ✓ | ✓ |  |  |
| `catalog.sku.barcode.delete` |  |  |  |  |
| `stock.receipt.create` | ✓ | ✓ |  |  |
| `stock.issue.create` | ✓ | ✓ | ✓ |  |
| `stock.adjustment.create` | ✓ | ✓ |  |  |
| `stock.balance.read` | ✓ | ✓ | ✓ | ✓ |
| `stock.move.read` | ✓ | ✓ | ✓ | ✓ |
| `stock.transfer.create` | ✓ | ✓ |  |  |
| `stock.transfer.read` | ✓ | ✓ | ✓ | ✓ |
| `stock.transfer.ship` | ✓ | ✓ |  |  |
| `stock.transfer.receive` | ✓ | ✓ |  |  |
| `stock.transfer.cancel` | ✓ | ✓ |  |  |
| `stock.inventory.create` | ✓ | ✓ |  |  |
| `stock.inventory.read` | ✓ | ✓ |  | ✓ |
| `stock.inventory.update` | ✓ | ✓ |  |  |
| `stock.inventory.close` | ✓ | ✓ |  |  |
| `stock.inventory.post` | ✓ | ✓ |  |  |
| `stock.inventory.cancel` | ✓ | ✓ |  |  |
| `marketing.channel.create` | ✓ |  |  |  |
| `marketing.channel.read` | ✓ |  |  | ✓ |
| `marketing.channel.update` | ✓ |  |  |  |
| `marketing.channel.delete` | ✓ |  |  |  |
| `marketing.campaign.create` | ✓ |  |  |  |
| `marketing.campaign.read` | ✓ |  |  | ✓ |
| `marketing.campaign.update` | ✓ |  |  |  |
| `marketing.campaign.delete` | ✓ |  |  |  |
| `marketing.promotion.create` | ✓ |  |  |  |
| `marketing.promotion.read` | ✓ | ✓ | ✓ | ✓ |
| `marketing.promotion.update` | ✓ |  |  |  |
| `marketing.promotion.delete` | ✓ |  |  |  |
| `marketing.audience.read` | ✓ |  |  | ✓ |
| `marketing.audience.manage` | ✓ |  |  |  |
| `marketing.content.read` | ✓ |  |  | ✓ |
| `marketing.content.manage` | ✓ |  |  |  |
| `audit.read` | ✓ |  |  | ✓ |
| `reports.read` | ✓ |  |  | ✓ |
| `reports.marketing.read` | ✓ |  |  | ✓ |
| `auth.user.manage` |  |  |  |  |
