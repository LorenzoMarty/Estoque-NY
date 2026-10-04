"""rename catalog and stock permission keys to domain prefix

Revision ID: 3e9f8a87d290
Revises: b1a9f3c2d4e5
Create Date: 2026-09-27 20:36:52.011935

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3e9f8a87d290"
down_revision: Union[str, Sequence[str], None] = "b1a9f3c2d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Renamed to follow the `dominio.recurso.acao` pattern (Fase 4 do admin-api-roadmap).
# permission_id is stable (role_permissions references it by id, not by key), so
# existing role assignments survive this rename untouched.
RENAMES = [
    ("branch.create", "stock.branch.create"),
    ("branch.read", "stock.branch.read"),
    ("branch.update", "stock.branch.update"),
    ("branch.delete", "stock.branch.delete"),
    ("location.create", "stock.location.create"),
    ("location.read", "stock.location.read"),
    ("location.update", "stock.location.update"),
    ("location.delete", "stock.location.delete"),
    ("category.create", "catalog.category.create"),
    ("category.read", "catalog.category.read"),
    ("brand.create", "catalog.brand.create"),
    ("brand.read", "catalog.brand.read"),
    ("brand.update", "catalog.brand.update"),
    ("brand.delete", "catalog.brand.delete"),
    ("product.create", "catalog.product.create"),
    ("product.read", "catalog.product.read"),
    ("product.update", "catalog.product.update"),
    ("sku.create", "catalog.sku.create"),
    ("sku.read", "catalog.sku.read"),
    ("sku.update", "catalog.sku.update"),
    ("sku.barcode.create", "catalog.sku.barcode.create"),
    ("sku.barcode.delete", "catalog.sku.barcode.delete"),
]


def upgrade() -> None:
    """Rename permission keys in place; permission_id (and role_permissions) unchanged."""
    permissions = sa.table("permissions", sa.column("key", sa.String))
    for old_key, new_key in RENAMES:
        op.execute(
            permissions.update().where(permissions.c.key == old_key).values(key=new_key)
        )


def downgrade() -> None:
    """Revert permission keys to their pre-Fase-4 names."""
    permissions = sa.table("permissions", sa.column("key", sa.String))
    for old_key, new_key in RENAMES:
        op.execute(
            permissions.update().where(permissions.c.key == new_key).values(key=old_key)
        )
