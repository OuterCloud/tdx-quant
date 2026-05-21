import json
from datetime import date

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.data_task import DataTask
from app.models.screening import ScreeningResult
from app.models.stock import Stock
from app.schemas.dashboard import BuyListItem, DataStatus, MarketOverview, TodaySummary
from app.core.config import settings

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/market-overview")
async def market_overview() -> MarketOverview:
    async with async_session() as session:
        total = await session.scalar(select(func.count()).select_from(Stock))
        trading = await session.scalar(
            select(func.count()).select_from(Stock).where(Stock.is_suspended == False)
        )
        st = await session.scalar(
            select(func.count()).select_from(Stock).where(Stock.is_st == True)
        )
        last_task = await session.scalar(
            select(DataTask.finished_at)
            .where(DataTask.status == "done")
            .order_by(DataTask.finished_at.desc())
            .limit(1)
        )

    return MarketOverview(
        total_stocks=total or 0,
        trading_stocks=trading or 0,
        st_stocks=st or 0,
        data_updated_at=last_task.isoformat() + "Z" if last_task else None,
    )


@router.get("/today-summary")
async def today_summary() -> TodaySummary:
    today = date.today()
    async with async_session() as session:
        total = await session.scalar(select(func.count()).select_from(Stock))
        layer1 = await session.scalar(
            select(func.count())
            .select_from(Stock)
            .where(
                Stock.is_st == False,
                Stock.is_suspended == False,
                ~Stock.code.startswith("8"),
                ~Stock.code.startswith("688"),
            )
        )
        layer2 = await session.scalar(
            select(func.count())
            .select_from(ScreeningResult)
            .where(ScreeningResult.screen_date == today)
        )

    return TodaySummary(
        screen_date=today.isoformat(),
        total_screened=total or 0,
        layer1_passed=layer1 or 0,
        layer2_passed=layer2 or 0,
    )


@router.get("/buy-list")
async def buy_list() -> list[BuyListItem]:
    today = date.today()
    redis = get_redis()
    try:
        async with async_session() as session:
            result = await session.execute(
                select(ScreeningResult)
                .where(ScreeningResult.screen_date == today)
                .order_by(ScreeningResult.score.desc())
                .limit(50)
            )
            results = list(result.scalars().all())

        items = []
        for sr in results:
            # Try Redis first (real-time), fall back to stored snapshot
            indicator_data = await redis.get(f"indicator:{sr.stock_code}")
            if indicator_data:
                indicators = json.loads(indicator_data)
            else:
                # Use snapshot saved during screening
                details = json.loads(sr.details) if sr.details else {}
                indicators = details.get("snapshot", {})

            items.append(
                BuyListItem(
                    stock_code=sr.stock_code,
                    stock_name=sr.stock_name,
                    close=indicators.get("close"),
                    amount=indicators.get("amount"),
                    ma5=indicators.get("ma5"),
                    ma10=indicators.get("ma10"),
                    ma20=indicators.get("ma20"),
                    ma60=indicators.get("ma60"),
                    macd_hist=indicators.get("macd_hist"),
                    macd_golden_cross=indicators.get("macd_golden_cross", False),
                    score=sr.score,
                )
            )
        return items
    finally:
        await redis.aclose()


@router.get("/data-status")
async def data_status() -> DataStatus:
    from app.main import task_manager

    kline_dir = settings.DATA_DIR / "kline"
    total_files = len(list(kline_dir.glob("*.parquet"))) if kline_dir.exists() else 0

    async with async_session() as session:
        last_task = (
            await session.execute(
                select(DataTask).order_by(DataTask.created_at.desc()).limit(1)
            )
        ).scalar_one_or_none()

    return DataStatus(
        has_data=total_files > 0,
        total_files=total_files,
        last_task_status=last_task.status if last_task else None,
        last_task_time=last_task.created_at.isoformat() + "Z" if last_task else None,
        is_busy=task_manager.is_busy,
    )
