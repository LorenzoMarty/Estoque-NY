"""Permission sets of the branch roles. Documented in docs/roles-matrix.md."""

from app.core.permissions import ALL_PERMISSIONS

MANAGER_ROLE = "manager"
STOCKKEEPER_ROLE = "stockkeeper"
SELLER_ROLE = "seller"
AUDITOR_ROLE = "auditor"

# Roles that make sense per branch. "admin" is global by nature and excluded.
BRANCH_ROLES = (MANAGER_ROLE, STOCKKEEPER_ROLE, SELLER_ROLE, AUDITOR_ROLE)

_CATALOG_READ = {
    "catalog.category.read",
    "catalog.brand.read",
    "catalog.product.read",
    "catalog.sku.read",
}
_SELLER = {
    "stock.issue.create",
    "stock.balance.read",
    "stock.move.read",
    "stock.branch.read",
    "stock.location.read",
    "stock.transfer.read",
    "marketing.promotion.read",
} | _CATALOG_READ
_STOCKKEEPER = _SELLER | {
    "stock.receipt.create",
    "stock.adjustment.create",
    "stock.transfer.create",
    "stock.transfer.ship",
    "stock.transfer.receive",
    "stock.transfer.cancel",
    "stock.inventory.create",
    "stock.inventory.read",
    "stock.inventory.update",
    "stock.inventory.close",
    "stock.inventory.post",
    "stock.inventory.cancel",
    "catalog.sku.barcode.create",
}
_MANAGER = (
    _STOCKKEEPER
    | {
        "catalog.category.create",
        "catalog.brand.create",
        "catalog.brand.update",
        "catalog.product.create",
        "catalog.product.update",
        "catalog.sku.create",
        "catalog.sku.update",
        "stock.location.create",
        "stock.location.update",
        "reports.read",
        "reports.marketing.read",
        "audit.read",
    }
    | {key for key in ALL_PERMISSIONS if key.startswith("marketing.")}
)
# Read-only everywhere: every key that only reads.
_AUDITOR = {key for key in ALL_PERMISSIONS if key.endswith(".read")}

ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    MANAGER_ROLE: frozenset(_MANAGER),
    STOCKKEEPER_ROLE: frozenset(_STOCKKEEPER),
    SELLER_ROLE: frozenset(_SELLER),
    AUDITOR_ROLE: frozenset(_AUDITOR),
}

assert all(  # a typo in a key above must fail at import, not silently grant nothing
    keys <= set(ALL_PERMISSIONS) for keys in ROLE_PERMISSIONS.values()
)


def render_matrix_markdown() -> str:
    """The table in docs/roles-matrix.md; a test keeps the file in sync."""
    # admin / stock_operator / viewer are defined in auth_service.ensure_rbac_seed;
    # only the four branch roles are listed per permission here.
    lines = [
        "| Permission | " + " | ".join(ROLE_PERMISSIONS) + " |",
        "|---|" + "|".join(":-:" for _ in ROLE_PERMISSIONS) + "|",
    ]
    for key in ALL_PERMISSIONS:
        marks = [
            "✓" if key in ROLE_PERMISSIONS[role] else "" for role in ROLE_PERMISSIONS
        ]
        lines.append(f"| `{key}` | " + " | ".join(marks) + " |")
    return "\n".join(lines) + "\n"
