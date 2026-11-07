"""add blind/approval fields to inventory_counts

Revision ID: e4b8d1f6a3c7
Revises: a4c7e1b9d3f5
Create Date: 2026-11-07 13:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4b8d1f6a3c7"
down_revision: Union[str, Sequence[str], None] = "a4c7e1b9d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("inventory_counts") as batch:
        batch.add_column(
            sa.Column("blind", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("approved_by", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch.create_foreign_key(
            "fk_inventory_counts_approved_by_users",
            "users",
            ["approved_by"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("inventory_counts") as batch:
        batch.drop_constraint(
            "fk_inventory_counts_approved_by_users", type_="foreignkey"
        )
        batch.drop_column("approved_at")
        batch.drop_column("approved_by")
        batch.drop_column("blind")
