"""Sales import routes (issue #33): JSON for an API client, CSV for a spreadsheet.

Both default to `dry_run=true`: the report says what would happen and nothing is kept.
"""

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.data_io import _decode, _read_limited
from app.api.security import get_current_user, require_permission
from app.core.branch_scope import BranchScope, get_branch_scope
from app.core.db import get_session
from app.models.entities import User
from app.schemas.base import SchemaBase
from app.services import sales_import_service as svc
from app.services.audit_service import write_audit_log

router = APIRouter(prefix="/sales/import", tags=["sales"])


class ImportItem(SchemaBase):
    sku_code: str
    qty: int = Field(..., gt=0)
    unit_price: Decimal | None = Field(default=None, ge=0)


class ImportSale(SchemaBase):
    external_id: str = Field(..., min_length=1, max_length=120)
    branch_id: int
    sold_at: datetime
    customer_id: int | None = None
    items: list[ImportItem] = Field(..., min_length=1)


class ImportIn(SchemaBase):
    source: str = Field(..., min_length=1, max_length=50)
    sales: list[ImportSale] = Field(..., max_length=1000)


async def _run_import(
    request, session, scope, user, source, sales, errors, dry_run
) -> dict:
    report = await svc.import_sales(
        session,
        f"import:{source}",
        sales,
        dry_run=dry_run,
        user_id=user.id if user else None,
        allowed_branch=scope.allows,
        prior_errors=errors,
    )
    if not dry_run:
        await write_audit_log(
            session,
            request=request,
            user_id=user.id if user else None,
            action="sales.sale.import",
            resource_type="sale",
            resource_id=None,
            after={"source": source, **report.as_dict()["totals"]},
        )
        await session.commit()
    else:
        await session.rollback()
    return report.as_dict()


@router.post(
    "",
    dependencies=[Depends(require_permission("sales.sale.import", branch_scoped=True))],
)
async def import_sales_json(
    payload: ImportIn,
    request: Request,
    dry_run: bool = Query(True, description="Report only; nothing is written."),
    user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    sales = {
        s.external_id: {
            "branch_id": s.branch_id,
            "sold_at": s.sold_at,
            "customer_id": s.customer_id,
            "items": [(i.sku_code, i.qty, i.unit_price) for i in s.items],
        }
        for s in payload.sales
    }
    return await _run_import(
        request, session, scope, user, payload.source, sales, [], dry_run
    )


@router.post(
    "/csv",
    dependencies=[Depends(require_permission("sales.sale.import", branch_scoped=True))],
)
async def import_sales_csv(
    request: Request,
    source: str = Query(..., min_length=1, max_length=50),
    dry_run: bool = Query(True, description="Report only; nothing is written."),
    user: User | None = Depends(get_current_user),
    scope: BranchScope = Depends(get_branch_scope),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """CSV body (`Content-Type: text/csv`), one line per item; see the service docs."""
    sales, errors = svc.parse_csv(_decode(await _read_limited(request)))
    return await _run_import(
        request, session, scope, user, source, sales, errors, dry_run
    )
