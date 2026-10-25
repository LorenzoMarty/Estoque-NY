"""add stock_thresholds (min/max per SKU and branch)

Revision ID: e6b3c8a1d5f2
Revises: d9a2e5b7c1f4
Create Date: 2026-10-24 22:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6b3c8a1d5f2"
down_revision: Union[str, Sequence[str], None] = "d9a2e5b7c1f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_thresholds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("min_qty", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_qty", sa.Integer(), nullable=True),
        sa.Column("last_alert_on", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "branch_id", "sku_id", name="uq_stock_thresholds_branch_sku"
        ),
    )


def downgrade() -> None:
    op.drop_table("stock_thresholds")
