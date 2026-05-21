from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.backtest import router as backtest_router
from app.api.dashboard import router as dashboard_router
from app.api.data_mgmt import router as data_mgmt_router
from app.api.screening import router as screening_router
from app.api.sectors import router as sectors_router
from app.api.stocks import router as stocks_router
from app.api.strategies import router as strategies_router
from app.api.ws import router as ws_router

api_router = APIRouter(prefix="/api")
api_router.include_router(health_router, tags=["health"])
api_router.include_router(backtest_router)
api_router.include_router(dashboard_router)
api_router.include_router(data_mgmt_router)
api_router.include_router(sectors_router)
api_router.include_router(stocks_router)
api_router.include_router(screening_router)
api_router.include_router(strategies_router)

# WebSocket router (no /api prefix)
ws_api_router = ws_router
