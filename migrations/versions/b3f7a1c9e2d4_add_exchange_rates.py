"""add exchange_rates (append-only USD base to display currencies)

Revision ID: b3f7a1c9e2d4
Revises: a4c7e1b9d3f5
Create Date: 2026-11-07 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3f7a1c9e2d4"
down_revision: Union[str, Sequence[str], None] = "a4c7e1b9d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("base_currency", sa.String(length=3), nullable=False),
        sa.Column("quote_currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(18, 8), nullable=False),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "base_currency",
            "quote_currency",
            "effective_date",
            name="uq_exchange_rates_pair_date",
        ),
    )


def downgrade() -> None:
    op.drop_table("exchange_rates")
