"""add branch_id to audit_logs

Revision ID: f1d4c7a9b2e6
Revises: e6b3c8a1d5f2
Create Date: 2026-10-25 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1d4c7a9b2e6"
down_revision: Union[str, Sequence[str], None] = "e6b3c8a1d5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # No foreign key: audit rows must outlive a deleted branch.
    with op.batch_alter_table("audit_logs") as batch:
        batch.add_column(sa.Column("branch_id", sa.Integer(), nullable=True))
        batch.create_index("ix_audit_logs_branch_id", ["branch_id"])


def downgrade() -> None:
    with op.batch_alter_table("audit_logs") as batch:
        batch.drop_index("ix_audit_logs_branch_id")
        batch.drop_column("branch_id")
