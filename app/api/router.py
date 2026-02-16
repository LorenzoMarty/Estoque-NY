from fastapi import APIRouter

from app.api.routes import branches, health, locations, products, skus, stock

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(branches.router)
api_router.include_router(locations.router)
api_router.include_router(products.router)
api_router.include_router(skus.router)
api_router.include_router(stock.router)
