import asyncio
from datetime import datetime

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session
from app.core.logging import publish_log
from app.models.data_task import DataTask
from app.models.stock import Stock
from app.services.data_fetcher import DataFetcher
from app.services.indicator import compute_all_indicators
from app.services.screener import run_screening


class TaskManager:
    def __init__(self):
        self.fetcher = DataFetcher()
        self._running_task: str | None = None

    @property
    def is_busy(self) -> bool:
        return self._running_task is not None

    async def start_init_task(self) -> str:
        """Start a full data initialization task."""
        if self.is_busy:
            raise RuntimeError("A task is already running")
        return await self._run_task("init", incremental=False)

    async def start_update_task(self) -> str:
        """Start an incremental update task."""
        if self.is_busy:
            raise RuntimeError("A task is already running")
        return await self._run_task("update", incremental=True)

    async def _run_task(self, task_type: str, incremental: bool) -> str:
        async with async_session() as session:
            task = DataTask(task_type=task_type, status="running")
            session.add(task)
            await session.commit()
            await session.refresh(task)
            task_id = task.id

        self._running_task = task_id
        asyncio.create_task(self._execute(task_id, task_type, incremental))
        return task_id

    async def _execute(self, task_id: str, task_type: str, incremental: bool):
        try:
            await publish_log(f"Task {task_type} started", "INFO")

            # 1. Fetch stock list
            await publish_log("Fetching stock list from TDX...", "INFO")
            stocks = await self.fetcher.fetch_stock_list()
            await publish_log(f"Found {len(stocks)} stocks", "INFO")

            # Save stock list to DB
            await self._save_stocks(stocks)

            # Apply test mode limit
            if settings.TDX_TEST_MODE:
                stocks = stocks[: settings.TDX_TEST_STOCK_LIMIT]
                await publish_log(
                    f"TEST MODE: limiting to {len(stocks)} stocks", "WARNING"
                )

            # Update task total
            async with async_session() as session:
                task = await session.get(DataTask, task_id)
                task.total = len(stocks)
                await session.commit()

            # 2. Download K-line data
            await publish_log("Downloading K-line data...", "INFO")

            async def on_progress(current, total, success, failed):
                if current % 50 == 0 or current == total:
                    await publish_log(
                        f"Progress: {current}/{total} (success={success}, failed={failed})",
                        "INFO",
                    )
                async with async_session() as session:
                    task = await session.get(DataTask, task_id)
                    task.progress = current
                    await session.commit()

            result = await self.fetcher.download_all(
                stocks, on_progress=on_progress, incremental=incremental
            )
            await publish_log(
                f"Download complete: {result['success']}/{result['total']} succeeded", "INFO"
            )

            # 3. Compute indicators
            await publish_log("Computing indicators...", "INFO")
            await compute_all_indicators(stocks)
            await publish_log("Indicators computed", "INFO")

            # 4. Run screening
            await publish_log("Running screening...", "INFO")
            screen_result = await run_screening()
            screen_count = screen_result["layer4"] if isinstance(screen_result, dict) else screen_result
            await publish_log(f"Screening complete: {screen_count} stocks passed", "INFO")

            # Mark task done
            async with async_session() as session:
                task = await session.get(DataTask, task_id)
                task.status = "done"
                task.finished_at = datetime.now()
                task.message = f"Success: {result['success']}/{result['total']}"
                await session.commit()

            await publish_log(f"Task {task_type} completed successfully", "INFO")

        except Exception as e:
            logger.exception(f"Task {task_id} failed")
            await publish_log(f"Task failed: {e}", "ERROR")
            async with async_session() as session:
                task = await session.get(DataTask, task_id)
                task.status = "failed"
                task.finished_at = datetime.now()
                task.message = str(e)
                await session.commit()
        finally:
            self._running_task = None

    async def _save_stocks(self, stocks: list[dict]):
        async with async_session() as session:
            for s in stocks:
                existing = await session.get(Stock, s["code"])
                if existing:
                    existing.name = s["name"]
                    existing.market = s["market"]
                else:
                    stock = Stock(code=s["code"], name=s["name"], market=s["market"])
                    session.add(stock)
            await session.commit()

    async def get_task(self, task_id: str) -> DataTask | None:
        async with async_session() as session:
            return await session.get(DataTask, task_id)

    async def get_recent_tasks(self, limit: int = 10) -> list[DataTask]:
        async with async_session() as session:
            result = await session.execute(
                select(DataTask).order_by(DataTask.created_at.desc()).limit(limit)
            )
            return list(result.scalars().all())

    def shutdown(self):
        self.fetcher.shutdown()
