"""add public profile fields to branches

Revision ID: b8e4a2c6d1f3
Revises: 9a3c5e7b1d20
Create Date: 2026-10-24 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8e4a2c6d1f3"
down_revision: Union[str, Sequence[str], None] = "9a3c5e7b1d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("branches") as batch:
        batch.add_column(sa.Column("public_name", sa.String(length=120)))
        batch.add_column(sa.Column("address", sa.String(length=255)))
        batch.add_column(sa.Column("phone", sa.String(length=40)))
        batch.add_column(sa.Column("opening_hours", sa.JSON()))
        batch.add_column(sa.Column("timezone", sa.String(length=64)))


def downgrade() -> None:
    with op.batch_alter_table("branches") as batch:
        for column in ("timezone", "opening_hours", "phone", "address", "public_name"):
            batch.drop_column(column)
