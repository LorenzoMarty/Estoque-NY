"""add reason_code to stock_moves

Revision ID: d9a2e5b7c1f4
Revises: c3f1a9d7e2b4
Create Date: 2026-10-24 20:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9a2e5b7c1f4"
down_revision: Union[str, Sequence[str], None] = "c3f1a9d7e2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("stock_moves") as batch:
        batch.add_column(sa.Column("reason_code", sa.String(length=32)))
        batch.create_index("ix_stock_moves_reason_code", ["reason_code"])


def downgrade() -> None:
    with op.batch_alter_table("stock_moves") as batch:
        batch.drop_index("ix_stock_moves_reason_code")
        batch.drop_column("reason_code")
