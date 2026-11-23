"""add slug and es/en descriptions to products

Revision ID: d2c6e8a4f1b9
Revises: a4c7e1b9d3f5
Create Date: 2026-11-07 12:00:00.000000

"""

import re
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2c6e8a4f1b9"
down_revision: Union[str, Sequence[str], None] = "a4c7e1b9d3f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:200] or "produto"


def upgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.add_column(sa.Column("slug", sa.String(length=220), nullable=True))
        batch.add_column(sa.Column("description_es", sa.Text(), nullable=True))
        batch.add_column(sa.Column("description_en", sa.Text(), nullable=True))

    conn = op.get_bind()
    taken: set[str] = set()
    for pid, name in conn.execute(sa.text("SELECT id, name FROM products ORDER BY id")):
        base = _slugify(name)
        slug, n = base, 2
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        conn.execute(
            sa.text("UPDATE products SET slug = :s WHERE id = :i"),
            {"s": slug, "i": pid},
        )

    op.create_index("ix_products_slug", "products", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_products_slug", table_name="products")
    with op.batch_alter_table("products") as batch:
        batch.drop_column("description_en")
        batch.drop_column("description_es")
        batch.drop_column("slug")
