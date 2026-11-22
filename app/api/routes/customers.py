"""Customers with LGPD consent (issue #31).

Delete-on-request is `POST /customers/{id}/anonymize`: PII is blanked, the row stays so
past sales keep their foreign key. Export-on-request is `GET /customers/{id}/export`.
See docs/lgpd-customers.md.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, page_meta
from app.models.entities import ConsentRecord, Customer, User
from app.schemas.customer import (
    ConsentIn,
    ConsentOut,
    CustomerIn,
    CustomerOut,
    CustomerPatch,
)
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/customers", tags=["customers"])


async def _current_consents(session: AsyncSession, customer_id: int) -> dict[str, bool]:
    rows = await session.scalars(
        select(ConsentRecord)
        .where(ConsentRecord.customer_id == customer_id)
        .order_by(ConsentRecord.id)
    )
    return {r.purpose: r.granted for r in rows}  # later rows overwrite earlier ones


async def _out(session: AsyncSession, c: Customer) -> CustomerOut:
    return CustomerOut(
        id=c.id,
        document=c.document,
        name=c.name,
        email=c.email,
        phone=c.phone,
        created_at=c.created_at,
        anonymized_at=c.anonymized_at,
        consents=await _current_consents(session, c.id),
    )


async def _get(session: AsyncSession, customer_id: int) -> Customer:
    customer = await session.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "customer not found")
    return customer


def _live(customer: Customer) -> None:
    if customer.anonymized_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "customer was anonymized")


async def _audit(session, request, user, action, customer_id, after=None) -> None:
    # Audit holds ids and field names only, never the personal data itself.
    await write_audit_log(
        session,
        request=request,
        user_id=user.id if user else None,
        action=action,
        resource_type="customer",
        resource_id=customer_id,
        after=after,
    )


async def _commit(session: AsyncSession) -> None:
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "document already used") from exc


@router.post(
    "",
    response_model=CustomerOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sales.customer.create"))],
)
async def create_customer(
    payload: CustomerIn,
    request: Request,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    customer = Customer(**payload.model_dump())
    session.add(customer)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "document already used") from exc
    await _audit(session, request, user, "sales.customer.create", customer.id)
    await _commit(session)
    return await _out(session, customer)


@router.get("", dependencies=[Depends(require_permission("sales.customer.read"))])
async def list_customers(
    q: str | None = Query(default=None, min_length=2),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(get_session),
) -> dict:
    stmt = select(Customer)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Customer.name).like(like),
                func.lower(Customer.email).like(like),
                Customer.document.like(f"%{q.upper()}%"),
                Customer.phone.like(f"%{q}%"),
            )
        )
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (
        await session.scalars(
            stmt.order_by(Customer.id).limit(page_size).offset((page - 1) * page_size)
        )
    ).all()
    return {
        "items": [(await _out(session, c)).model_dump(mode="json") for c in rows],
        "meta": page_meta(total=int(total), page=page, page_size=page_size),
    }


@router.get(
    "/{customer_id}",
    response_model=CustomerOut,
    dependencies=[Depends(require_permission("sales.customer.read"))],
)
async def get_customer(
    customer_id: int, session: AsyncSession = Depends(get_session)
) -> Any:
    return await _out(session, await _get(session, customer_id))


@router.patch(
    "/{customer_id}",
    response_model=CustomerOut,
    dependencies=[Depends(require_permission("sales.customer.update"))],
)
async def update_customer(
    customer_id: int,
    payload: CustomerPatch,
    request: Request,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    customer = await _get(session, customer_id)
    _live(customer)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(customer, field, value)
    fields = {"fields": sorted(changes)}
    await _audit(session, request, user, "sales.customer.update", customer.id, fields)
    await _commit(session)
    return await _out(session, customer)


@router.post(
    "/{customer_id}/consents",
    response_model=ConsentOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("sales.customer.update"))],
)
async def record_consent(
    customer_id: int,
    payload: ConsentIn,
    request: Request,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Grant or withdraw one purpose; history is kept (append-only)."""
    customer = await _get(session, customer_id)
    _live(customer)
    record = ConsentRecord(
        customer_id=customer.id,
        purpose=payload.purpose.value,
        granted=payload.granted,
        source=payload.source,
        recorded_by=user.id if user else None,
    )
    session.add(record)
    after = {"purpose": record.purpose, "granted": record.granted}
    await _audit(session, request, user, "sales.customer.consent", customer.id, after)
    await session.commit()
    await session.refresh(record)
    return ConsentOut.model_validate(record)


@router.get(
    "/{customer_id}/export",
    dependencies=[Depends(require_permission("sales.customer.read"))],
)
async def export_customer(
    customer_id: int, session: AsyncSession = Depends(get_session)
) -> dict:
    """Everything we hold about the person (LGPD art. 18, access/portability)."""
    customer = await _get(session, customer_id)
    consents = await session.scalars(
        select(ConsentRecord)
        .where(ConsentRecord.customer_id == customer.id)
        .order_by(ConsentRecord.id)
    )
    return {
        "customer": (await _out(session, customer)).model_dump(mode="json"),
        "consent_history": [
            ConsentOut.model_validate(r).model_dump(mode="json") for r in consents
        ],
    }


@router.post(
    "/{customer_id}/anonymize",
    response_model=CustomerOut,
    dependencies=[Depends(require_permission("sales.customer.delete"))],
)
async def anonymize_customer(
    customer_id: int,
    request: Request,
    user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Delete-on-request: blank the personal data and withdraw every consent."""
    customer = await _get(session, customer_id)
    if customer.anonymized_at is None:
        customer.name = "Anonymized"
        customer.document = customer.email = customer.phone = None
        customer.anonymized_at = datetime.now(UTC)
        for purpose in await _current_consents(session, customer.id):
            session.add(
                ConsentRecord(
                    customer_id=customer.id,
                    purpose=purpose,
                    granted=False,
                    source="anonymization",
                    recorded_by=user.id if user else None,
                )
            )
        await _audit(session, request, user, "sales.customer.anonymize", customer.id)
        await session.commit()
    return await _out(session, customer)
