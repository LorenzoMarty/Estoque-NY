"""add daily_closes

Revision ID: d7f4b0c3e5a9
Revises: c6e3a9b2d4f8
Create Date: 2026-11-07 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7f4b0c3e5a9"
down_revision: Union[str, Sequence[str], None] = "c6e3a9b2d4f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "daily_closes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("closed_by", sa.Integer(), nullable=True),
        sa.Column(
            "closed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["closed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("branch_id", "day", name="uq_daily_closes_branch_day"),
    )


def downgrade() -> None:
    op.drop_table("daily_closes")
