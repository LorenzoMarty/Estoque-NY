from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import (
    CampaignStatus,
    DiscountType,
    InventoryCountStatus,
    LocationType,
    MarketingChannelType,
    MoveType,
    PromotionStatus,
    TransferStatus,
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("branch_id", "name", name="uq_locations_branch_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[LocationType] = mapped_column(
        Enum(LocationType, name="location_type"),
        nullable=False,
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Campo legado mantido para compatibilidade.
    brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class SKU(Base):
    __tablename__ = "skus"
    __table_args__ = (Index("ix_skus_product_id", "product_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_code: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    # Campo legado: unit equivale ao UOM.
    unit: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="UN",
        server_default="UN",
    )
    attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    cost: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )
    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )
    tax_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class SKUBarcode(Base):
    __tablename__ = "sku_barcodes"
    __table_args__ = (UniqueConstraint("barcode", name="uq_sku_barcodes_barcode"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"),
        nullable=False,
    )
    barcode: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class MarketingChannel(Base):
    __tablename__ = "marketing_channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    type: Mapped[MarketingChannelType] = mapped_column(
        Enum(MarketingChannelType, name="marketing_channel_type"),
        nullable=False,
    )
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        Index("ix_campaigns_status_dates", "status", "starts_at", "ends_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, name="campaign_status"),
        nullable=False,
        default=CampaignStatus.DRAFT,
        server_default=CampaignStatus.DRAFT.value,
    )
    channel_id: Mapped[int | None] = mapped_column(
        ForeignKey("marketing_channels.id", ondelete="SET NULL"),
        nullable=True,
    )
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Promotion(Base):
    __tablename__ = "promotions"
    __table_args__ = (
        Index("ix_promotions_status_dates", "status", "starts_at", "ends_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[PromotionStatus] = mapped_column(
        Enum(PromotionStatus, name="promotion_status"),
        nullable=False,
        default=PromotionStatus.DRAFT,
        server_default=PromotionStatus.DRAFT.value,
    )
    discount_type: Mapped[DiscountType | None] = mapped_column(
        Enum(DiscountType, name="discount_type"),
        nullable=True,
    )
    discount_value: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class AudienceSegment(Base):
    __tablename__ = "audience_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rules_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class ContentAsset(Base):
    __tablename__ = "content_assets"
    __table_args__ = (Index("ix_content_assets_campaign_id", "campaign_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(60), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class CampaignProduct(Base):
    __tablename__ = "campaign_products"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "product_id",
            name="uq_campaign_products_campaign_product",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class PromotionSKU(Base):
    __tablename__ = "promotion_skus"
    __table_args__ = (
        UniqueConstraint(
            "promotion_id",
            "sku_id",
            name="uq_promotion_skus_promotion_sku",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    promotion_id: Mapped[int] = mapped_column(
        ForeignKey("promotions.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class TransferOrder(Base):
    __tablename__ = "transfer_orders"
    __table_args__ = (
        Index("ix_transfer_orders_status_created_at", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False,
    )
    from_location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    to_branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="RESTRICT"),
        nullable=False,
    )
    to_location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[TransferStatus] = mapped_column(
        Enum(TransferStatus, name="transfer_status"),
        nullable=False,
        default=TransferStatus.DRAFT,
        server_default=TransferStatus.DRAFT.value,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TransferOrderItem(Base):
    __tablename__ = "transfer_order_items"
    __table_args__ = (
        UniqueConstraint("transfer_id", "sku_id", name="uq_transfer_item_transfer_sku"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("transfer_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)


class InventoryCount(Base):
    __tablename__ = "inventory_counts"
    __table_args__ = (
        Index("ix_inventory_counts_status_started_at", "status", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[int] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[InventoryCountStatus] = mapped_column(
        Enum(InventoryCountStatus, name="inventory_count_status"),
        nullable=False,
        default=InventoryCountStatus.OPEN,
        server_default=InventoryCountStatus.OPEN.value,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


class InventoryCountLine(Base):
    __tablename__ = "inventory_count_lines"
    __table_args__ = (
        UniqueConstraint(
            "count_id", "sku_id", name="uq_inventory_count_line_count_sku"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    count_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_counts.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"),
        nullable=False,
    )
    system_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    counted_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diff_qty: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    posted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )


class StockBalance(Base):
    __tablename__ = "stock_balances"
    __table_args__ = (
        UniqueConstraint(
            "branch_id",
            "sku_id",
            "location_id",
            name="uq_stock_balances_branch_sku_location",
        ),
        Index("ix_stock_balances_lookup", "branch_id", "location_id", "sku_id"),
        Index(
            "uq_stock_balances_branch_sku_null_location",
            "branch_id",
            "sku_id",
            unique=True,
            postgresql_where=text("location_id IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=True,
    )
    on_hand: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class StockMove(Base):
    __tablename__ = "stock_moves"
    __table_args__ = (
        Index(
            "uq_stock_moves_type_reference_id_not_null",
            "move_type",
            "reference_id",
            unique=True,
            postgresql_where=text("reference_id IS NOT NULL"),
        ),
        Index(
            "ix_stock_moves_branch_location_sku_created",
            "branch_id",
            "location_id",
            "sku_id",
            "created_at",
        ),
        Index("ix_stock_moves_type_created", "move_type", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    branch_id: Mapped[int] = mapped_column(
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )
    sku_id: Mapped[int] = mapped_column(
        ForeignKey("skus.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    transfer_id: Mapped[int | None] = mapped_column(
        ForeignKey("transfer_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    inventory_count_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_counts.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    move_type: Mapped[MoveType] = mapped_column(
        Enum(MoveType, name="move_type"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(120), nullable=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint(
            "role_id",
            "permission_id",
            name="uq_role_permissions_role_permission",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
    )
    permission_id: Mapped[int] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
        Index("ix_audit_logs_user_created_at", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(150), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    meta_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("key", "route", name="uq_idempotency_key_route"),
        Index("ix_idempotency_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    route: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=func.now(),
    )
