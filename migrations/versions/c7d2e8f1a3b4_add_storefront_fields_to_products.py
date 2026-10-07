"""add storefront fields to products

Revision ID: c7d2e8f1a3b4
Revises: 3e9f8a87d290
Create Date: 2026-10-04 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c7d2e8f1a3b4"
down_revision: Union[str, Sequence[str], None] = "3e9f8a87d290"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("products") as batch_op:
        batch_op.add_column(
            sa.Column(
                "featured",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "published",
                sa.Boolean(),
                server_default=sa.text("false"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("image_url", sa.String(length=500), nullable=True)
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_column("image_url")
        batch_op.drop_column("published")
        batch_op.drop_column("featured")
