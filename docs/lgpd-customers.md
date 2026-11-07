# Customers and LGPD consent

`Customer` holds the minimum: name, optional document, email, phone. Nothing is sent to a
customer unless the matching consent is currently granted.

- **Consent**: `POST /customers/{id}/consents` with `purpose` (`MARKETING_EMAIL`,
  `MARKETING_WHATSAPP`, `DATA_PROCESSING`), `granted` and `source` (where it was collected).
  The log is append-only; the latest row per purpose is the current state. Withdrawing is a
  new row with `granted=false`.
- **Access / portability** (LGPD art. 18): `GET /customers/{id}/export` returns the data and
  the full consent history.
- **Delete on request**: `POST /customers/{id}/anonymize` blanks name, document, email and
  phone, withdraws every consent and keeps the row so past sales keep their foreign key.
  It is irreversible; only roles with `sales.customer.delete` (admin, manager) can do it.
- **Audit**: entries hold ids and changed field names, never the personal data.
- **Access control**: `sales.customer.*` permissions; sellers can create, read and update,
  only admin/manager can anonymize. Customers are global (not per branch).

Assumed: retention period and the legal basis per purpose need the owner/DPO to confirm.
