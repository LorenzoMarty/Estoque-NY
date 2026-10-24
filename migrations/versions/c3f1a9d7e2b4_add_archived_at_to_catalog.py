"""add archived_at and archive_reason to categories, products and skus

Revision ID: c3f1a9d7e2b4
Revises: b8e4a2c6d1f3
Create Date: 2026-10-24 15:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f1a9d7e2b4"
down_revision: Union[str, Sequence[str], None] = "b8e4a2c6d1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("categories", "products", "skus")


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("archived_at", sa.DateTime(timezone=True)))
            batch.add_column(sa.Column("archive_reason", sa.String(length=255)))
            batch.create_index(f"ix_{table}_archived_at", ["archived_at"])


def downgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_archived_at")
            batch.drop_column("archive_reason")
            batch.drop_column("archived_at")
