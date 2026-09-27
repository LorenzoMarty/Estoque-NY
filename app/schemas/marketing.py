from datetime import datetime
from decimal import Decimal

from pydantic import Field, field_validator, model_validator

from app.models.enums import (
    CampaignStatus,
    DiscountType,
    MarketingChannelType,
    PromotionStatus,
)
from app.schemas.base import SchemaBase


def _normalize_required_text(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("value cannot be empty")
    return normalized


class MarketingChannelBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)
    type: MarketingChannelType
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value)


class MarketingChannelCreate(MarketingChannelBase):
    pass


class MarketingChannelUpdate(SchemaBase):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: MarketingChannelType | None = None
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_required_text(value)


class MarketingChannelOut(MarketingChannelBase):
    id: int
    created_at: datetime


class CampaignBase(SchemaBase):
    name: str = Field(min_length=1, max_length=160)
    status: CampaignStatus = CampaignStatus.DRAFT
    channel_id: int | None = None
    objective: str | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "CampaignBase":
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return self


class CampaignCreate(CampaignBase):
    product_ids: list[int] = Field(default_factory=list)


class CampaignUpdate(SchemaBase):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    status: CampaignStatus | None = None
    channel_id: int | None = None
    objective: str | None = None
    budget: Decimal | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    product_ids: list[int] | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "CampaignUpdate":
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return self


class CampaignOut(CampaignBase):
    id: int
    created_by: int | None
    created_at: datetime
    product_ids: list[int] = Field(default_factory=list)


class PromotionBase(SchemaBase):
    name: str = Field(min_length=1, max_length=160)
    campaign_id: int | None = None
    status: PromotionStatus = PromotionStatus.DRAFT
    discount_type: DiscountType | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "PromotionBase":
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return self


class PromotionCreate(PromotionBase):
    sku_ids: list[int] = Field(default_factory=list)


class PromotionUpdate(SchemaBase):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    campaign_id: int | None = None
    status: PromotionStatus | None = None
    discount_type: DiscountType | None = None
    discount_value: Decimal | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    sku_ids: list[int] | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_required_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "PromotionUpdate":
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("ends_at must be greater than or equal to starts_at")
        return self


class PromotionOut(PromotionBase):
    id: int
    created_at: datetime
    sku_ids: list[int] = Field(default_factory=list)


class AudienceSegmentBase(SchemaBase):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    rules_json: dict | None = None
    active: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_required_text(value)


class AudienceSegmentCreate(AudienceSegmentBase):
    pass


class AudienceSegmentUpdate(SchemaBase):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    rules_json: dict | None = None
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_required_text(value)


class AudienceSegmentOut(AudienceSegmentBase):
    id: int
    created_at: datetime


class ContentAssetBase(SchemaBase):
    title: str = Field(min_length=1, max_length=160)
    asset_type: str = Field(min_length=1, max_length=60)
    campaign_id: int | None = None
    url: str | None = None
    meta_json: dict | None = None

    @field_validator("title", "asset_type")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _normalize_required_text(value)


class ContentAssetCreate(ContentAssetBase):
    pass


class ContentAssetUpdate(SchemaBase):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    asset_type: str | None = Field(default=None, min_length=1, max_length=60)
    campaign_id: int | None = None
    url: str | None = None
    meta_json: dict | None = None

    @field_validator("title", "asset_type")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_required_text(value)


class ContentAssetOut(ContentAssetBase):
    id: int
    created_at: datetime


class MarketingChannelListOut(SchemaBase):
    items: list[MarketingChannelOut]
    meta: dict[str, int | None]


class CampaignListOut(SchemaBase):
    items: list[CampaignOut]
    meta: dict[str, int | None]


class PromotionListOut(SchemaBase):
    items: list[PromotionOut]
    meta: dict[str, int | None]


class AudienceSegmentListOut(SchemaBase):
    items: list[AudienceSegmentOut]
    meta: dict[str, int | None]


class ContentAssetListOut(SchemaBase):
    items: list[ContentAssetOut]
    meta: dict[str, int | None]
