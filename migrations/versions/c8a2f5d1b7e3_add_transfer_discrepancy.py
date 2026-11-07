"""add received_qty and discrepancy_reason to transfers

Revision ID: c8a2f5d1b7e3
Revises: a4c7e1b9d3f5
Create Date: 2026-11-07 11:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c8a2f5d1b7e3"
down_revision: Union[str, Sequence[str], None] = "a4c7e1b9d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "transfer_order_items", sa.Column("received_qty", sa.Integer(), nullable=True)
    )
    op.add_column(
        "transfer_orders", sa.Column("discrepancy_reason", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("transfer_orders", "discrepancy_reason")
    op.drop_column("transfer_order_items", "received_qty")
