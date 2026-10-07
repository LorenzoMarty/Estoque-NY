from fastapi import APIRouter

from app.api.routes import (
    health,
    public,
)
from app.modules import (
    audit,
    auth,
    branches,
    catalog,
    inventory,
    locations,
    marketing,
    products,
    reports,
    skus,
    stock,
    transfers,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(public.router)
api_router.include_router(auth.router)
api_router.include_router(branches.router)
api_router.include_router(locations.router)
api_router.include_router(catalog.router)
api_router.include_router(products.router)
api_router.include_router(skus.router)
api_router.include_router(stock.router)
api_router.include_router(transfers.router)
api_router.include_router(inventory.router)
api_router.include_router(marketing.router)
api_router.include_router(audit.router)
api_router.include_router(reports.router)
api_router.include_router(reports.marketing_router)
