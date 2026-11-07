from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.models.entities import ExchangeRate, User
from app.schemas.base import SchemaBase
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

BASE_CURRENCY = "USD"  # prices are stored in USD (ADR 0005)
DISPLAY_CURRENCIES = {"BRL", "UYU", "ARS"}


class ExchangeRateIn(SchemaBase):
    quote_currency: str
    rate: Decimal = Field(gt=0, max_digits=18, decimal_places=8)
    source: str = Field(min_length=1, max_length=120)
    effective_date: date

    @field_validator("quote_currency")
    @classmethod
    def known_currency(cls, v: str) -> str:
        v = v.upper()
        if v not in DISPLAY_CURRENCIES:
            raise ValueError(
                f"quote_currency must be one of {sorted(DISPLAY_CURRENCIES)}"
            )
        return v


class ExchangeRateOut(SchemaBase):
    id: int
    base_currency: str
    quote_currency: str
    rate: Decimal
    source: str
    effective_date: date


@router.post(
    "",
    status_code=201,
    response_model=ExchangeRateOut,
    dependencies=[Depends(require_permission("auth.user.manage"))],
)
async def create_rate(
    payload: ExchangeRateIn,
    request: Request,
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ExchangeRateOut:
    row = ExchangeRate(base_currency=BASE_CURRENCY, **payload.model_dump())
    session.add(row)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            409,
            "a rate for this currency and date already exists; rates are append-only",
        ) from exc
    out = ExchangeRateOut.model_validate(row)
    await write_audit_log(
        session,
        request=request,
        user_id=current_user.id if current_user else None,
        action="exchange_rate.create",
        resource_type="exchange_rate",
        resource_id=row.id,
        before=None,
        after=out.model_dump(mode="json"),
    )
    await session.commit()
    return out


@router.get(
    "",
    response_model=list[ExchangeRateOut],
    dependencies=[Depends(require_permission("reports.read"))],
)
async def list_rates(
    quote_currency: str | None = Query(default=None),
    on: date | None = Query(default=None, description="Rate in force on this date"),
    session: AsyncSession = Depends(get_session),
) -> list[ExchangeRateOut]:
    """Newest first; with ``on``, only the rate in force that day per currency."""
    stmt = select(ExchangeRate).order_by(
        ExchangeRate.effective_date.desc(), ExchangeRate.id.desc()
    )
    if quote_currency:
        stmt = stmt.where(ExchangeRate.quote_currency == quote_currency.upper())
    if on:
        stmt = stmt.where(ExchangeRate.effective_date <= on)
    rows = (await session.scalars(stmt)).all()
    if on:  # keep the newest row per currency
        newest: dict[str, ExchangeRate] = {}
        for r in rows:  # rows are newest first
            newest.setdefault(r.quote_currency, r)
        rows = list(newest.values())
    return [ExchangeRateOut.model_validate(r) for r in rows]
