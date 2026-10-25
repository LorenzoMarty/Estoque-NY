"""add lots and lot_allocations

Revision ID: a4c7e1b9d3f5
Revises: f1d4c7a9b2e6
Create Date: 2026-10-25 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4c7e1b9d3f5"
down_revision: Union[str, Sequence[str], None] = "f1d4c7a9b2e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("on_hand", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "branch_id", "sku_id", "code", name="uq_lots_branch_sku_code"
        ),
    )
    op.create_index("ix_lots_expires_on", "lots", ["expires_on"])
    op.create_table(
        "lot_allocations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("move_id", sa.Integer(), nullable=False),
        sa.Column("lot_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["move_id"], ["stock_moves.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lot_id"], ["lots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lot_allocations_move_id", "lot_allocations", ["move_id"])
    op.create_index("ix_lot_allocations_lot_id", "lot_allocations", ["lot_id"])


def downgrade() -> None:
    op.drop_table("lot_allocations")
    op.drop_table("lots")
