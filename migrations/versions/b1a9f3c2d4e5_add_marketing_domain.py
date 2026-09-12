"""add marketing domain

Revision ID: b1a9f3c2d4e5
Revises: 4c6c5ec2d9a1
Create Date: 2026-07-05 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b1a9f3c2d4e5"
down_revision: Union[str, Sequence[str], None] = "4c6c5ec2d9a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "marketing_channels",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "EMAIL",
                "SOCIAL",
                "PAID_MEDIA",
                "MARKETPLACE",
                "STORE",
                "OTHER",
                name="marketing_channel_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "audience_segments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rules_json", sa.JSON(), nullable=True),
        sa.Column(
            "active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "DRAFT",
                "SCHEDULED",
                "ACTIVE",
                "PAUSED",
                "FINISHED",
                "CANCELLED",
                name="campaign_status",
            ),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column("channel_id", sa.Integer(), nullable=True),
        sa.Column("objective", sa.Text(), nullable=True),
        sa.Column("budget", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["channel_id"],
            ["marketing_channels.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_campaigns_status_dates",
        "campaigns",
        ["status", "starts_at", "ends_at"],
        unique=False,
    )
    op.create_table(
        "promotions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "DRAFT",
                "SCHEDULED",
                "ACTIVE",
                "PAUSED",
                "FINISHED",
                "CANCELLED",
                name="promotion_status",
            ),
            server_default="DRAFT",
            nullable=False,
        ),
        sa.Column(
            "discount_type",
            sa.Enum("PERCENT", "FIXED", "CUSTOM", name="discount_type"),
            nullable=True,
        ),
        sa.Column("discount_value", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_promotions_status_dates",
        "promotions",
        ["status", "starts_at", "ends_at"],
        unique=False,
    )
    op.create_table(
        "campaign_products",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["campaign_id"],
            ["campaigns.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "campaign_id",
            "product_id",
            name="uq_campaign_products_campaign_product",
        ),
    )
    op.create_table(
        "content_assets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("asset_type", sa.String(length=60), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("meta_json", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_content_assets_campaign_id",
        "content_assets",
        ["campaign_id"],
        unique=False,
    )
    op.create_table(
        "promotion_skus",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("promotion_id", sa.Integer(), nullable=False),
        sa.Column("sku_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["promotion_id"],
            ["promotions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["sku_id"], ["skus.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "promotion_id",
            "sku_id",
            name="uq_promotion_skus_promotion_sku",
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("promotion_skus")
    op.drop_index("ix_content_assets_campaign_id", table_name="content_assets")
    op.drop_table("content_assets")
    op.drop_table("campaign_products")
    op.drop_index("ix_promotions_status_dates", table_name="promotions")
    op.drop_table("promotions")
    op.drop_index("ix_campaigns_status_dates", table_name="campaigns")
    op.drop_table("campaigns")
    op.drop_table("audience_segments")
    op.drop_table("marketing_channels")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS discount_type")
        op.execute("DROP TYPE IF EXISTS promotion_status")
        op.execute("DROP TYPE IF EXISTS campaign_status")
        op.execute("DROP TYPE IF EXISTS marketing_channel_type")
