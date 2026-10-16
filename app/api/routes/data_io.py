import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import domain_error_to_http
from app.api.security import get_current_user, require_permission
from app.core.db import get_session
from app.domain.errors import DomainError
from app.models.entities import User
from app.services import catalog_io_service
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/data", tags=["data"])


@router.post(
    "/import/catalog",
    dependencies=[
        Depends(require_permission("catalog.sku.create")),
        Depends(require_permission("stock.receipt.create")),
    ],
)
async def import_catalog(
    request: Request,
    dry_run: bool = Query(
        True, description="Validate and report only; nothing is written."
    ),
    mode: Literal["partial", "all_or_nothing"] = Query("all_or_nothing"),
    current_user: User | None = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Import products, SKUs and opening stock from a CSV sent as the request body.

    Send `Content-Type: text/csv` (UTF-8; `,` or `;` as separator). The report lists
    every bad row by line number. Rules: `app/services/catalog_io_service.py`.
    """
    body = await request.body()
    try:
        report = await catalog_io_service.import_catalog(
            session,
            body.decode("utf-8-sig", errors="replace"),
            dry_run=dry_run,
            mode=mode,
            user_id=current_user.id if current_user else None,
        )
    except DomainError as exc:
        await session.rollback()
        raise domain_error_to_http(exc) from exc
    except Exception:
        await session.rollback()
        raise

    if report.applied:
        await write_audit_log(
            session,
            request=request,
            user_id=current_user.id if current_user else None,
            action="data.import.catalog",
            resource_type="catalog",
            resource_id=None,
            before=None,
            after={"mode": mode, **report.as_dict()["totals"]},
        )
        await session.commit()
    return report.as_dict()


@router.get(
    "/export/catalog.csv",
    dependencies=[
        Depends(require_permission("catalog.sku.read")),
        Depends(require_permission("stock.balance.read")),
    ],
)
async def export_catalog(session: AsyncSession = Depends(get_session)):
    """Every SKU (one row per stocked branch/location) in the import format."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    async for row in catalog_io_service.export_catalog_rows(session):
        writer.writerow(row)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=catalog.csv"},
    )
