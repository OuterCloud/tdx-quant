import json
from datetime import date

from fastapi import APIRouter, Query
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.screening import ScreeningResult
from app.schemas.screening import ScreeningConfig, ScreeningResultItem, ScreeningRunResponse
from app.services.screener import get_preset_strategies, run_screening

router = APIRouter(prefix="/screening", tags=["screening"])

_CONFIG_KEY = "screening:config:v2"


async def _get_config() -> ScreeningConfig:
    redis: Redis = get_redis()
    try:
        data = await redis.get(_CONFIG_KEY)
        if data:
            return ScreeningConfig.model_validate_json(data)
        return ScreeningConfig()
    finally:
        await redis.aclose()


async def _save_config(config: ScreeningConfig):
    redis: Redis = get_redis()
    try:
        await redis.set(_CONFIG_KEY, config.model_dump_json())
    finally:
        await redis.aclose()


@router.get("/config")
async def get_config() -> ScreeningConfig:
    return await _get_config()


@router.put("/config")
async def update_config(config: ScreeningConfig) -> ScreeningConfig:
    await _save_config(config)
    return config


@router.get("/presets")
async def get_presets() -> dict:
    """Get all preset strategy templates."""
    return get_preset_strategies()


@router.post("/apply-preset/{name}")
async def apply_preset(name: str) -> ScreeningConfig:
    """Apply a preset strategy template as the active config."""
    presets = get_preset_strategies()
    if name not in presets:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")

    preset = presets[name]
    config_data = preset["config"]
    config = ScreeningConfig(
        active_preset=name,
        **config_data,
    )
    await _save_config(config)
    return config


@router.post("/run")
async def run_screen() -> ScreeningRunResponse:
    """Start screening as a background task. Progress published via WebSocket."""
    import asyncio
    asyncio.create_task(_run_screening_task())
    return ScreeningRunResponse(count=0, message="选股任务已启动")


async def _run_screening_task():
    """Background screening task with progress logging."""
    from app.services.indicator import compute_all_indicators
    from app.core.database import async_session as get_session
    from app.core.logging import publish_log
    from app.models.stock import Stock as StockModel
    from sqlalchemy import select as sa_select

    try:
        await publish_log("[screening:start] 开始选股...", "INFO")

        # Step 1: Check if indicators need refresh
        redis_check: Redis = get_redis()
        try:
            async with get_session() as session:
                sample = await session.scalar(sa_select(StockModel.code).limit(1))
            if sample:
                cached = await redis_check.get(f"indicator:{sample}")
                if not cached:
                    await publish_log("[screening:indicators] 指标缓存已过期，正在重新计算...", "INFO")
                    async with get_session() as session:
                        result = await session.execute(sa_select(StockModel))
                        all_stocks = [
                            {"code": s.code, "market": s.market}
                            for s in result.scalars().all()
                        ]
                    await compute_all_indicators(all_stocks)
                    await publish_log("[screening:indicators_done] 指标计算完成", "INFO")
        finally:
            await redis_check.aclose()

        # Step 2: Run screening
        await publish_log("[screening:filtering] 正在执行4层筛选...", "INFO")
        config = await _get_config()
        config_dict = config.model_dump()
        result = await run_screening(config_dict)

        total = result["total"]
        l1 = result["layer1"]
        l2 = result["layer2"]
        l3 = result["layer3"]
        l4 = result["layer4"]
        await publish_log(
            f"[screening:done] 筛选完成: {total}只 → L1:{l1} → L2:{l2} → L3:{l3} → L4:{l4}",
            "INFO",
        )

    except Exception as e:
        await publish_log(f"[screening:error] 选股失败: {e}", "ERROR")


@router.get("/results")
async def get_results(
    screen_date: str | None = Query(None, description="Date in YYYY-MM-DD format"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, description="Search by stock code or name"),
) -> dict:
    target_date = date.fromisoformat(screen_date) if screen_date else date.today()

    redis: Redis = get_redis()
    try:
        async with async_session() as session:
            from sqlalchemy import func, or_

            base_filter = [ScreeningResult.screen_date == target_date]
            if search:
                base_filter.append(
                    or_(
                        ScreeningResult.stock_code.contains(search),
                        ScreeningResult.stock_name.contains(search),
                    )
                )

            total = await session.scalar(
                select(func.count())
                .select_from(ScreeningResult)
                .where(*base_filter)
            )

            result = await session.execute(
                select(ScreeningResult)
                .where(*base_filter)
                .order_by(ScreeningResult.score.desc())
                .offset((page - 1) * size)
                .limit(size)
            )
            results = list(result.scalars().all())

        items = []
        for sr in results:
            # Try Redis first (real-time), fall back to stored snapshot
            indicator_data = await redis.get(f"indicator:{sr.stock_code}")
            if indicator_data:
                indicators = json.loads(indicator_data)
            else:
                details = json.loads(sr.details) if sr.details else {}
                indicators = details.get("snapshot", {})

            items.append(
                ScreeningResultItem(
                    stock_code=sr.stock_code,
                    stock_name=sr.stock_name,
                    close=indicators.get("close"),
                    amount=indicators.get("amount"),
                    pct_change=indicators.get("pct_change"),
                    volume_ratio=indicators.get("volume_ratio"),
                    rsi14=indicators.get("rsi14"),
                    macd_hist=indicators.get("macd_hist"),
                    macd_golden_cross=indicators.get("macd_golden_cross", False),
                    kdj_golden_cross=indicators.get("kdj_golden_cross", False),
                    ma_aligned=indicators.get("ma_aligned", False),
                    boll_position=indicators.get("boll_position"),
                    max_drawdown_20d=indicators.get("max_drawdown_20d"),
                    score=sr.score,
                    details=sr.details,
                )
            )

        return {
            "total": total or 0,
            "screen_date": target_date.isoformat(),
            "page": page,
            "size": size,
            "items": items,
        }
    finally:
        await redis.aclose()
