import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
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
        # The import creates products, brands and categories and changes SKUs, so it
        # needs every permission those actions need on their own endpoints.
        Depends(require_permission("catalog.product.create")),
        Depends(require_permission("catalog.sku.create")),
        Depends(require_permission("catalog.sku.update")),
        Depends(require_permission("catalog.brand.create")),
        Depends(require_permission("catalog.category.create")),
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
    body = await _read_limited(request)
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

    try:
        if report.applied:
            await _audit_and_commit(session, request, current_user, mode, report)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="the catalog changed while importing (another import?); retry",
        ) from exc
    return report.as_dict()


async def _read_limited(request: Request) -> bytes:
    """Read the body but stop as soon as it passes the limit (no 5 MB+ in memory)."""
    limit = catalog_io_service.MAX_BYTES
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise _too_large(limit)
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise _too_large(limit)
        chunks.append(chunk)
    return b"".join(chunks)


def _too_large(limit: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"file is larger than {limit // (1024 * 1024)} MB",
    )


async def _audit_and_commit(session, request, current_user, mode, report) -> None:
    """The import and its audit entry commit together or not at all."""
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
