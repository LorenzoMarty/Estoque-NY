from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import apply_order_and_pagination, page_meta, pagination_params
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import (
    SKU,
    AudienceSegment,
    Campaign,
    CampaignProduct,
    ContentAsset,
    MarketingChannel,
    Product,
    Promotion,
    PromotionSKU,
    User,
)
from app.models.enums import CampaignStatus, PromotionStatus
from app.schemas.marketing import (
    AudienceSegmentCreate,
    AudienceSegmentListOut,
    AudienceSegmentOut,
    AudienceSegmentUpdate,
    CampaignCreate,
    CampaignListOut,
    CampaignOut,
    CampaignUpdate,
    ContentAssetCreate,
    ContentAssetListOut,
    ContentAssetOut,
    ContentAssetUpdate,
    MarketingChannelCreate,
    MarketingChannelListOut,
    MarketingChannelOut,
    MarketingChannelUpdate,
    PromotionCreate,
    PromotionListOut,
    PromotionOut,
    PromotionUpdate,
)
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/marketing", tags=["marketing"])


async def _ensure_channel_exists(
    session: AsyncSession,
    channel_id: int | None,
) -> None:
    if channel_id is None:
        return
    found = await session.scalar(
        select(MarketingChannel.id).where(MarketingChannel.id == channel_id)
    )
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"marketing channel {channel_id} not found",
        )


async def _ensure_campaign_exists(
    session: AsyncSession,
    campaign_id: int | None,
) -> None:
    if campaign_id is None:
        return
    found = await session.scalar(select(Campaign.id).where(Campaign.id == campaign_id))
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"campaign {campaign_id} not found",
        )


async def _ensure_products_exist(session: AsyncSession, product_ids: list[int]) -> None:
    ids = sorted(set(product_ids))
    if not ids:
        return
    found = set(
        (await session.scalars(select(Product.id).where(Product.id.in_(ids)))).all()
    )
    missing = sorted(set(ids) - found)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"products not found: {missing}",
        )


async def _ensure_skus_exist(session: AsyncSession, sku_ids: list[int]) -> None:
    ids = sorted(set(sku_ids))
    if not ids:
        return
    found = set((await session.scalars(select(SKU.id).where(SKU.id.in_(ids)))).all())
    missing = sorted(set(ids) - found)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"skus not found: {missing}",
        )


async def _campaign_product_ids(
    session: AsyncSession,
    campaign_id: int,
) -> list[int]:
    rows = await session.scalars(
        select(CampaignProduct.product_id)
        .where(CampaignProduct.campaign_id == campaign_id)
        .order_by(CampaignProduct.product_id)
    )
    return list(rows.all())


async def _promotion_sku_ids(session: AsyncSession, promotion_id: int) -> list[int]:
    rows = await session.scalars(
        select(PromotionSKU.sku_id)
        .where(PromotionSKU.promotion_id == promotion_id)
        .order_by(PromotionSKU.sku_id)
    )
    return list(rows.all())


async def _sync_campaign_products(
    session: AsyncSession,
    *,
    campaign_id: int,
    product_ids: list[int],
) -> None:
    expected = set(product_ids)
    existing = set(await _campaign_product_ids(session, campaign_id))
    for product_id in expected - existing:
        session.add(CampaignProduct(campaign_id=campaign_id, product_id=product_id))
    if existing - expected:
        await session.execute(
            delete(CampaignProduct).where(
                CampaignProduct.campaign_id == campaign_id,
                CampaignProduct.product_id.in_(existing - expected),
            )
        )


async def _sync_promotion_skus(
    session: AsyncSession,
    *,
    promotion_id: int,
    sku_ids: list[int],
) -> None:
    expected = set(sku_ids)
    existing = set(await _promotion_sku_ids(session, promotion_id))
    for sku_id in expected - existing:
        session.add(PromotionSKU(promotion_id=promotion_id, sku_id=sku_id))
    if existing - expected:
        await session.execute(
            delete(PromotionSKU).where(
                PromotionSKU.promotion_id == promotion_id,
                PromotionSKU.sku_id.in_(existing - expected),
            )
        )


async def _campaign_out(session: AsyncSession, campaign: Campaign) -> CampaignOut:
    data = CampaignOut.model_validate(campaign).model_dump()
    data["product_ids"] = await _campaign_product_ids(session, campaign.id)
    return CampaignOut.model_validate(data)


async def _promotion_out(session: AsyncSession, promotion: Promotion) -> PromotionOut:
    data = PromotionOut.model_validate(promotion).model_dump()
    data["sku_ids"] = await _promotion_sku_ids(session, promotion.id)
    return PromotionOut.model_validate(data)


@router.post(
    "/channels",
    response_model=MarketingChannelOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("marketing.channel.create"))],
)
async def create_channel(
    payload: MarketingChannelCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MarketingChannel:
    channel = MarketingChannel(**payload.model_dump())
    session.add(channel)
    try:
        await session.flush()
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="marketing.channel.create",
            resource_type="marketing_channel",
            resource_id=channel.id,
            before=None,
            after=MarketingChannelOut.model_validate(channel).model_dump(mode="json"),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="marketing channel name already exists",
        ) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(channel)
    return channel


@router.get(
    "/channels",
    response_model=MarketingChannelListOut,
    dependencies=[Depends(require_permission("marketing.channel.read"))],
)
async def list_channels(
    active: bool | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> MarketingChannelListOut:
    stmt = select(MarketingChannel)
    if active is not None:
        stmt = stmt.where(MarketingChannel.active == active)
    if params.q:
        stmt = stmt.where(MarketingChannel.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=MarketingChannel,
        params=params,
        allowed_sort_fields={"id", "name", "type", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return MarketingChannelListOut(
        items=[MarketingChannelOut.model_validate(row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.patch(
    "/channels/{channel_id}",
    response_model=MarketingChannelOut,
    dependencies=[Depends(require_permission("marketing.channel.update"))],
)
async def update_channel(
    channel_id: int,
    payload: MarketingChannelUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MarketingChannel:
    channel = await session.scalar(
        select(MarketingChannel).where(MarketingChannel.id == channel_id)
    )
    if channel is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"marketing channel {channel_id} not found",
        )

    before = MarketingChannelOut.model_validate(channel).model_dump(mode="json")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(channel, key, value)

    try:
        await session.flush()
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="marketing.channel.update",
            resource_type="marketing_channel",
            resource_id=channel.id,
            before=before,
            after=MarketingChannelOut.model_validate(channel).model_dump(mode="json"),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="marketing channel name already exists",
        ) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(channel)
    return channel


@router.post(
    "/campaigns",
    response_model=CampaignOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("marketing.campaign.create"))],
)
async def create_campaign(
    payload: CampaignCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CampaignOut:
    await _ensure_channel_exists(session, payload.channel_id)
    await _ensure_products_exist(session, payload.product_ids)

    campaign = Campaign(
        **payload.model_dump(exclude={"product_ids"}),
        created_by=current_user.id if current_user else None,
    )
    session.add(campaign)
    await session.flush()
    await _sync_campaign_products(
        session,
        campaign_id=campaign.id,
        product_ids=payload.product_ids,
    )
    out = await _campaign_out(session, campaign)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.campaign.create",
        resource_type="campaign",
        resource_id=campaign.id,
        before=None,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(campaign)
    return await _campaign_out(session, campaign)


@router.get(
    "/campaigns",
    response_model=CampaignListOut,
    dependencies=[Depends(require_permission("marketing.campaign.read"))],
)
async def list_campaigns(
    status_filter: CampaignStatus | None = Query(default=None, alias="status"),
    channel_id: int | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> CampaignListOut:
    stmt = select(Campaign)
    if status_filter is not None:
        stmt = stmt.where(Campaign.status == status_filter)
    if channel_id is not None:
        stmt = stmt.where(Campaign.channel_id == channel_id)
    if params.q:
        stmt = stmt.where(Campaign.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=Campaign,
        params=params,
        allowed_sort_fields={"id", "name", "status", "starts_at", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return CampaignListOut(
        items=[await _campaign_out(session, row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.get(
    "/campaigns/{campaign_id}",
    response_model=CampaignOut,
    dependencies=[Depends(require_permission("marketing.campaign.read"))],
)
async def get_campaign(
    campaign_id: int,
    session: AsyncSession = Depends(get_session),
) -> CampaignOut:
    campaign = await session.scalar(select(Campaign).where(Campaign.id == campaign_id))
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"campaign {campaign_id} not found",
        )
    return await _campaign_out(session, campaign)


@router.patch(
    "/campaigns/{campaign_id}",
    response_model=CampaignOut,
    dependencies=[Depends(require_permission("marketing.campaign.update"))],
)
async def update_campaign(
    campaign_id: int,
    payload: CampaignUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CampaignOut:
    campaign = await session.scalar(select(Campaign).where(Campaign.id == campaign_id))
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"campaign {campaign_id} not found",
        )

    before = (await _campaign_out(session, campaign)).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)
    product_ids = data.pop("product_ids", None)
    if "channel_id" in data:
        await _ensure_channel_exists(session, data["channel_id"])
    if product_ids is not None:
        await _ensure_products_exist(session, product_ids)

    for key, value in data.items():
        setattr(campaign, key, value)
    await session.flush()
    if product_ids is not None:
        await _sync_campaign_products(
            session,
            campaign_id=campaign.id,
            product_ids=product_ids,
        )

    out = await _campaign_out(session, campaign)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.campaign.update",
        resource_type="campaign",
        resource_id=campaign.id,
        before=before,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(campaign)
    return await _campaign_out(session, campaign)


@router.post(
    "/promotions",
    response_model=PromotionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("marketing.promotion.create"))],
)
async def create_promotion(
    payload: PromotionCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PromotionOut:
    await _ensure_campaign_exists(session, payload.campaign_id)
    await _ensure_skus_exist(session, payload.sku_ids)

    promotion = Promotion(**payload.model_dump(exclude={"sku_ids"}))
    session.add(promotion)
    await session.flush()
    await _sync_promotion_skus(
        session,
        promotion_id=promotion.id,
        sku_ids=payload.sku_ids,
    )
    out = await _promotion_out(session, promotion)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.promotion.create",
        resource_type="promotion",
        resource_id=promotion.id,
        before=None,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(promotion)
    return await _promotion_out(session, promotion)


@router.get(
    "/promotions",
    response_model=PromotionListOut,
    dependencies=[Depends(require_permission("marketing.promotion.read"))],
)
async def list_promotions(
    status_filter: PromotionStatus | None = Query(default=None, alias="status"),
    campaign_id: int | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> PromotionListOut:
    stmt = select(Promotion)
    if status_filter is not None:
        stmt = stmt.where(Promotion.status == status_filter)
    if campaign_id is not None:
        stmt = stmt.where(Promotion.campaign_id == campaign_id)
    if params.q:
        stmt = stmt.where(Promotion.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=Promotion,
        params=params,
        allowed_sort_fields={"id", "name", "status", "starts_at", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return PromotionListOut(
        items=[await _promotion_out(session, row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.patch(
    "/promotions/{promotion_id}",
    response_model=PromotionOut,
    dependencies=[Depends(require_permission("marketing.promotion.update"))],
)
async def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PromotionOut:
    promotion = await session.scalar(
        select(Promotion).where(Promotion.id == promotion_id)
    )
    if promotion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"promotion {promotion_id} not found",
        )

    before = (await _promotion_out(session, promotion)).model_dump(mode="json")
    data = payload.model_dump(exclude_unset=True)
    sku_ids = data.pop("sku_ids", None)
    if "campaign_id" in data:
        await _ensure_campaign_exists(session, data["campaign_id"])
    if sku_ids is not None:
        await _ensure_skus_exist(session, sku_ids)

    for key, value in data.items():
        setattr(promotion, key, value)
    await session.flush()
    if sku_ids is not None:
        await _sync_promotion_skus(
            session,
            promotion_id=promotion.id,
            sku_ids=sku_ids,
        )

    out = await _promotion_out(session, promotion)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.promotion.update",
        resource_type="promotion",
        resource_id=promotion.id,
        before=before,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(promotion)
    return await _promotion_out(session, promotion)


@router.post(
    "/audience-segments",
    response_model=AudienceSegmentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("marketing.audience.manage"))],
)
async def create_audience_segment(
    payload: AudienceSegmentCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AudienceSegment:
    segment = AudienceSegment(**payload.model_dump())
    session.add(segment)
    try:
        await session.flush()
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="marketing.audience.create",
            resource_type="audience_segment",
            resource_id=segment.id,
            before=None,
            after=AudienceSegmentOut.model_validate(segment).model_dump(mode="json"),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="audience segment name already exists",
        ) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(segment)
    return segment


@router.get(
    "/audience-segments",
    response_model=AudienceSegmentListOut,
    dependencies=[Depends(require_permission("marketing.audience.read"))],
)
async def list_audience_segments(
    active: bool | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> AudienceSegmentListOut:
    stmt = select(AudienceSegment)
    if active is not None:
        stmt = stmt.where(AudienceSegment.active == active)
    if params.q:
        stmt = stmt.where(AudienceSegment.name.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=AudienceSegment,
        params=params,
        allowed_sort_fields={"id", "name", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return AudienceSegmentListOut(
        items=[AudienceSegmentOut.model_validate(row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.patch(
    "/audience-segments/{segment_id}",
    response_model=AudienceSegmentOut,
    dependencies=[Depends(require_permission("marketing.audience.manage"))],
)
async def update_audience_segment(
    segment_id: int,
    payload: AudienceSegmentUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AudienceSegment:
    segment = await session.scalar(
        select(AudienceSegment).where(AudienceSegment.id == segment_id)
    )
    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"audience segment {segment_id} not found",
        )

    before = AudienceSegmentOut.model_validate(segment).model_dump(mode="json")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(segment, key, value)

    try:
        await session.flush()
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="marketing.audience.update",
            resource_type="audience_segment",
            resource_id=segment.id,
            before=before,
            after=AudienceSegmentOut.model_validate(segment).model_dump(mode="json"),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="audience segment name already exists",
        ) from exc
    except Exception:
        await session.rollback()
        raise

    await session.refresh(segment)
    return segment


@router.post(
    "/content-assets",
    response_model=ContentAssetOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("marketing.content.manage"))],
)
async def create_content_asset(
    payload: ContentAssetCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ContentAsset:
    await _ensure_campaign_exists(session, payload.campaign_id)
    asset = ContentAsset(**payload.model_dump())
    session.add(asset)
    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.content.create",
        resource_type="content_asset",
        resource_id=asset.id,
        before=None,
        after=ContentAssetOut.model_validate(asset).model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(asset)
    return asset


@router.get(
    "/content-assets",
    response_model=ContentAssetListOut,
    dependencies=[Depends(require_permission("marketing.content.read"))],
)
async def list_content_assets(
    campaign_id: int | None = Query(default=None),
    params=Depends(pagination_params),
    session: AsyncSession = Depends(get_session),
) -> ContentAssetListOut:
    stmt = select(ContentAsset)
    if campaign_id is not None:
        stmt = stmt.where(ContentAsset.campaign_id == campaign_id)
    if params.q:
        stmt = stmt.where(ContentAsset.title.ilike(f"%{params.q}%"))

    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = apply_order_and_pagination(
        stmt,
        model=ContentAsset,
        params=params,
        allowed_sort_fields={"id", "title", "asset_type", "created_at"},
    )
    rows = list((await session.scalars(stmt)).all())
    return ContentAssetListOut(
        items=[ContentAssetOut.model_validate(row) for row in rows],
        meta=page_meta(total=int(total), page=params.page, page_size=params.page_size),
    )


@router.patch(
    "/content-assets/{asset_id}",
    response_model=ContentAssetOut,
    dependencies=[Depends(require_permission("marketing.content.manage"))],
)
async def update_content_asset(
    asset_id: int,
    payload: ContentAssetUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ContentAsset:
    asset = await session.scalar(
        select(ContentAsset).where(ContentAsset.id == asset_id)
    )
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"content asset {asset_id} not found",
        )

    data = payload.model_dump(exclude_unset=True)
    if "campaign_id" in data:
        await _ensure_campaign_exists(session, data["campaign_id"])

    before = ContentAssetOut.model_validate(asset).model_dump(mode="json")
    for key, value in data.items():
        setattr(asset, key, value)

    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="marketing.content.update",
        resource_type="content_asset",
        resource_id=asset.id,
        before=before,
        after=ContentAssetOut.model_validate(asset).model_dump(mode="json"),
    )
    await session.commit()
    await session.refresh(asset)
    return asset
