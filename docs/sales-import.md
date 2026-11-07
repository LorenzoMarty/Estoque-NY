# Importing sales from an external POS

`POST /sales/import/csv?source=<name>&dry_run=true|false` (body `text/csv`) or
`POST /sales/import?dry_run=...` (JSON `{source, sales:[{external_id, branch_id, sold_at,
customer_id?, items:[{sku_code, qty, unit_price?}]}]}`). Needs `sales.sale.import` (manager).

CSV header, one line per item, `,` or `;`: `external_id,branch_id,sold_at,sku_code,qty,unit_price[,customer_id]`.
Lines with the same `external_id` form one sale. `sold_at` is ISO 8601.

- `dry_run` defaults to **true**: the report shows what would happen and keeps nothing.
- A sale is identified by `(import:<source>, external_id)`. Importing the same file twice
  reports `duplicates` and changes nothing.
- A bad sale (unknown `sku_code`, not enough stock, branch not allowed) is listed in
  `errors` and skipped; the others are imported. The report is the reconciliation:
  `created`, `duplicates`, `errors`.
