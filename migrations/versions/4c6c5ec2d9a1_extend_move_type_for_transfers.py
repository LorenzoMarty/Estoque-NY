"""extend move_type enum for transfers

Revision ID: 4c6c5ec2d9a1
Revises: 678cb1a6f4bf
Create Date: 2026-02-16 13:30:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4c6c5ec2d9a1"
down_revision: Union[str, Sequence[str], None] = "678cb1a6f4bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    context = op.get_context()
    with context.autocommit_block():
        op.execute("ALTER TYPE move_type ADD VALUE IF NOT EXISTS 'TRANSFER_SHIP'")
        op.execute("ALTER TYPE move_type ADD VALUE IF NOT EXISTS 'TRANSFER_RECEIVE'")


def downgrade() -> None:
    # Enum value removal is intentionally omitted to avoid destructive rebuild.
    return
