from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from loguru import logger
from sqlalchemy import update

from app.api.router import api_router, ws_api_router
from app.core.config import settings
from app.core.database import async_session, engine
from app.core.logging import setup_logging
from app.core.redis import pool
from app.models.data_task import DataTask
from app.services.task_manager import TaskManager

task_manager = TaskManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting tdx-quant...")
    # Ensure data directory exists
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    (settings.DATA_DIR / "kline").mkdir(parents=True, exist_ok=True)
    # Clean up stale running tasks from previous crash
    async with async_session() as session:
        result = await session.execute(
            update(DataTask)
            .where(DataTask.status == "running")
            .values(status="failed", message="Interrupted (server restart)", finished_at=datetime.now())
        )
        if result.rowcount:
            logger.info(f"Cleaned up {result.rowcount} stale running task(s)")
        await session.commit()
    yield
    logger.info("Shutting down tdx-quant...")
    task_manager.shutdown()
    await engine.dispose()
    await pool.aclose()


app = FastAPI(
    title="tdx-quant",
    description="通达信量化选股系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(api_router)
app.include_router(ws_api_router)
