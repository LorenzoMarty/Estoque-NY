"""add user_branches and backfill current access

Revision ID: f6c8d2e4b1a3
Revises: e5b7c1d3a9f2
Create Date: 2026-10-16 17:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6c8d2e4b1a3"
down_revision: Union[str, Sequence[str], None] = "e5b7c1d3a9f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_branches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("branch_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "branch_id", name="uq_user_branches_user_branch"
        ),
    )
    op.create_index(op.f("ix_user_branches_branch_id"), "user_branches", ["branch_id"])
    # Until now every user could use every branch. Keep that behavior for the
    # existing users so the upgrade locks nobody out; admins narrow it afterwards.
    op.execute(
        "INSERT INTO user_branches (user_id, branch_id) "
        "SELECT u.id, b.id FROM users u CROSS JOIN branches b"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_branches_branch_id"), table_name="user_branches")
    op.drop_table("user_branches")
