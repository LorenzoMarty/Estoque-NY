"""add products.is_new and products.collections

Revision ID: b7d2e9a4c1f6
Revises: a4c7e1b9d3f5
Create Date: 2026-11-07 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7d2e9a4c1f6"
down_revision: Union[str, Sequence[str], None] = "a4c7e1b9d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.add_column(
            sa.Column(
                "is_new", sa.Boolean(), nullable=False, server_default=sa.text("false")
            )
        )
        batch.add_column(sa.Column("collections", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.drop_column("collections")
        batch.drop_column("is_new")
