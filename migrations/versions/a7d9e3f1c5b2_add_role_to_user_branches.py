"""add per-branch role to user_branches

Revision ID: a7d9e3f1c5b2
Revises: f6c8d2e4b1a3
Create Date: 2026-10-16 18:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7d9e3f1c5b2"
down_revision: Union[str, Sequence[str], None] = "f6c8d2e4b1a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_branches") as batch_op:
        batch_op.add_column(sa.Column("role_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_user_branches_role_id_roles",
            "roles",
            ["role_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("user_branches") as batch_op:
        batch_op.drop_constraint("fk_user_branches_role_id_roles", type_="foreignkey")
        batch_op.drop_column("role_id")
