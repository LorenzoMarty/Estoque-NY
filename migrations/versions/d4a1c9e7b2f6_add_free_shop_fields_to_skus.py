"""add free-shop compliance fields to skus

Revision ID: d4a1c9e7b2f6
Revises: 3e9f8a87d290
Create Date: 2026-10-16 15:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4a1c9e7b2f6"
down_revision: Union[str, Sequence[str], None] = "3e9f8a87d290"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("skus") as batch_op:
        batch_op.add_column(sa.Column("ncm", sa.String(length=8), nullable=True))
        batch_op.add_column(sa.Column("origin", sa.String(length=20), nullable=True))
        batch_op.add_column(
            sa.Column(
                "restricted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("skus") as batch_op:
        batch_op.drop_column("restricted")
        batch_op.drop_column("origin")
        batch_op.drop_column("ncm")
