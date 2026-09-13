from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import SKU, Product, SKUBarcode, User
from app.schemas.sku import AddBarcodeIn, SKUCreate, SKUOut, SKUUpdate
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/catalog/skus", tags=["skus"])


async def _validate_product(session: AsyncSession, product_id: int) -> None:
    product_exists = await session.scalar(
        select(Product.id).where(Product.id == product_id)
    )
    if product_exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"product {product_id} not found",
        )


async def _assert_barcode_is_global_unique(
    session: AsyncSession,
    *,
    barcode: str | None,
    sku_id: int | None = None,
) -> None:
    if not barcode:
        return

    existing_sku_id = await session.scalar(select(SKU.id).where(SKU.barcode == barcode))
    if existing_sku_id is not None and existing_sku_id != sku_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"barcode {barcode} already registered",
        )

    existing_barcode_sku = await session.scalar(
        select(SKUBarcode.sku_id).where(SKUBarcode.barcode == barcode)
    )
    if existing_barcode_sku is not None and existing_barcode_sku != sku_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"barcode {barcode} already registered",
        )


@router.post(
    "",
    response_model=SKUOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sku.create"))],
)
async def create_sku(
    payload: SKUCreate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SKU:
    await _validate_product(session, payload.product_id)
    await _assert_barcode_is_global_unique(session, barcode=payload.barcode)

    sku = SKU(
        product_id=payload.product_id,
        sku_code=payload.sku_code,
        name=payload.name,
        barcode=payload.barcode,
        unit=payload.unit.upper(),
        attributes=payload.attributes,
        cost=payload.cost,
        price=payload.price,
        tax_code=payload.tax_code,
        active=payload.active,
    )
    session.add(sku)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="sku_code or barcode already exists",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="sku.create",
        resource_type="sku",
        resource_id=sku.id,
        before=None,
        after=SKUOut.model_validate(sku).model_dump(),
    )
    await session.commit()
    await session.refresh(sku)
    return sku


@router.patch(
    "/{sku_id}",
    response_model=SKUOut,
    dependencies=[Depends(require_permission("sku.update"))],
)
async def update_sku(
    sku_id: int,
    payload: SKUUpdate,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SKU:
    sku = await session.scalar(select(SKU).where(SKU.id == sku_id))
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"sku {sku_id} not found",
        )

    if payload.barcode is not None:
        await _assert_barcode_is_global_unique(
            session,
            barcode=payload.barcode,
            sku_id=sku.id,
        )

    before = SKUOut.model_validate(sku).model_dump()
    update_data = payload.model_dump(exclude_unset=True)
    if "unit" in update_data and isinstance(update_data["unit"], str):
        update_data["unit"] = update_data["unit"].upper()
    for key, value in update_data.items():
        setattr(sku, key, value)

    await session.flush()
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="sku.update",
        resource_type="sku",
        resource_id=sku.id,
        before=before,
        after=SKUOut.model_validate(sku).model_dump(),
    )
    await session.commit()
    await session.refresh(sku)
    return sku


@router.post(
    "/{sku_id}/barcodes",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sku.barcode.create"))],
)
async def add_sku_barcodes(
    sku_id: int,
    payload: AddBarcodeIn,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    sku = await session.scalar(select(SKU).where(SKU.id == sku_id))
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"sku {sku_id} not found",
        )

    if not payload.barcodes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="barcodes cannot be empty",
        )

    inserted: list[str] = []
    for barcode in payload.barcodes:
        await _assert_barcode_is_global_unique(session, barcode=barcode, sku_id=sku.id)
        session.add(SKUBarcode(sku_id=sku.id, barcode=barcode))
        inserted.append(barcode)

    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="barcode already exists",
        ) from exc

    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="sku.barcode.create",
        resource_type="sku",
        resource_id=sku.id,
        before=None,
        after={"barcodes": inserted},
    )
    await session.commit()
    return {"sku_id": sku.id, "barcodes": inserted}


@router.delete(
    "/{sku_id}/barcodes/{barcode}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("sku.barcode.delete"))],
)
async def delete_sku_barcode(
    sku_id: int,
    barcode: str,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    sku = await session.scalar(select(SKU).where(SKU.id == sku_id))
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"sku {sku_id} not found",
        )

    sku_barcode = await session.scalar(
        select(SKUBarcode).where(
            SKUBarcode.sku_id == sku_id, SKUBarcode.barcode == barcode
        )
    )
    if sku_barcode is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="barcode not found for sku",
        )

    await session.delete(sku_barcode)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="sku.barcode.delete",
        resource_type="sku",
        resource_id=sku.id,
        before={"barcode": barcode},
        after=None,
    )
    await session.commit()


@router.get(
    "",
    response_model=list[SKUOut],
    dependencies=[Depends(require_permission("sku.read"))],
)
async def list_skus(
    product_id: int | None = Query(default=None),
    active: bool | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("id"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    session: AsyncSession = Depends(get_session),
) -> list[SKU]:
    stmt = select(SKU)
    if product_id is not None:
        stmt = stmt.where(SKU.product_id == product_id)
    if active is not None:
        stmt = stmt.where(SKU.active == active)
    if q:
        stmt = stmt.where(
            or_(
                SKU.sku_code.ilike(f"%{q}%"),
                SKU.name.ilike(f"%{q}%"),
                SKU.barcode.ilike(f"%{q}%"),
            )
        )

    if sort not in {"id", "sku_code", "created_at", "name"}:
        sort = "id"
    column = getattr(SKU, sort)
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc())
    stmt = stmt.limit(page_size).offset((page - 1) * page_size)

    result = await session.scalars(stmt)
    return list(result.all())
