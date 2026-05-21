"""4-Layer screening funnel with preset strategy templates.

Layer 1: 基础过滤 (Hard exclusions)
Layer 2: 趋势确认 (Trend confirmation)
Layer 3: 量价择时 (Volume-price timing)
Layer 4: 风控过滤 (Risk control)
"""

import json
from datetime import date

from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import delete, select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.screening import ScreeningResult
from app.models.stock import Stock

# Preset strategy templates
PRESET_STRATEGIES = {
    "放量突破": {
        "description": "均线多头排列 + 成交量放大 + MACD金叉，适合趋势行情初期",
        "layer1": {
            "exclude_st": True,
            "exclude_suspended": True,
            "exclude_bse": True,
            "exclude_star": True,
        },
        "layer2": {
            "require_ma_aligned": True,
            "ma_periods": [5, 10, 20, 60],
            "require_trend_strong": False,
            "require_di_bullish": True,
            "min_adx": 0,
        },
        "layer3": {
            "min_amount": 2e8,
            "min_volume_ratio": 1.5,
            "require_macd_golden_cross": True,
            "require_macd_positive": False,
            "require_kdj_golden_cross": False,
            "rsi_min": 40,
            "rsi_max": 80,
        },
        "layer4": {
            "max_drawdown_limit": 15,
            "max_consecutive_down": -3,
            "max_bias": 10,
            "min_bias": -15,
            "wr_overbought": 20,
            "boll_upper_limit": 0.95,
        },
    },
    "缩量回调": {
        "description": "趋势向上但短期缩量回调，适合低吸布局",
        "layer1": {
            "exclude_st": True,
            "exclude_suspended": True,
            "exclude_bse": True,
            "exclude_star": True,
        },
        "layer2": {
            "require_ma_aligned": True,
            "ma_periods": [5, 10, 20, 60],
            "require_trend_strong": False,
            "require_di_bullish": True,
            "min_adx": 0,
        },
        "layer3": {
            "min_amount": 1e8,
            "min_volume_ratio": 0,
            "max_volume_ratio": 0.8,
            "require_macd_golden_cross": False,
            "require_macd_positive": True,
            "require_kdj_golden_cross": False,
            "rsi_min": 30,
            "rsi_max": 55,
        },
        "layer4": {
            "max_drawdown_limit": 10,
            "max_consecutive_down": -5,
            "max_bias": 5,
            "min_bias": -10,
            "wr_overbought": 999,
            "boll_upper_limit": 0.6,
        },
    },
    "底部反转": {
        "description": "超跌 + KDJ/MACD底部金叉，适合抄底",
        "layer1": {
            "exclude_st": True,
            "exclude_suspended": True,
            "exclude_bse": True,
            "exclude_star": True,
        },
        "layer2": {
            "require_ma_aligned": False,
            "ma_periods": [5, 10, 20, 60],
            "require_trend_strong": False,
            "require_di_bullish": False,
            "min_adx": 0,
        },
        "layer3": {
            "min_amount": 1.5e8,
            "min_volume_ratio": 1.2,
            "require_macd_golden_cross": True,
            "require_macd_positive": False,
            "require_kdj_golden_cross": True,
            "rsi_min": 15,
            "rsi_max": 45,
        },
        "layer4": {
            "max_drawdown_limit": 30,
            "max_consecutive_down": -8,
            "max_bias": 0,
            "min_bias": -20,
            "wr_overbought": 999,
            "boll_upper_limit": 0.4,
        },
    },
    "均线粘合": {
        "description": "MA5/10/20/60 价差收窄即将突破，适合等待方向选择",
        "layer1": {
            "exclude_st": True,
            "exclude_suspended": True,
            "exclude_bse": True,
            "exclude_star": True,
        },
        "layer2": {
            "require_ma_aligned": False,
            "require_ma_converge": True,
            "ma_converge_pct": 3.0,
            "ma_periods": [5, 10, 20, 60],
            "require_trend_strong": False,
            "require_di_bullish": False,
            "min_adx": 0,
        },
        "layer3": {
            "min_amount": 1.5e8,
            "min_volume_ratio": 0,
            "require_macd_golden_cross": False,
            "require_macd_positive": False,
            "require_kdj_golden_cross": False,
            "rsi_min": 35,
            "rsi_max": 65,
        },
        "layer4": {
            "max_drawdown_limit": 12,
            "max_consecutive_down": -4,
            "max_bias": 5,
            "min_bias": -5,
            "wr_overbought": 999,
            "boll_upper_limit": 0.75,
        },
    },
}

# Default config matches "放量突破" strategy
DEFAULT_CONFIG = {
    "active_preset": "放量突破",
    "layer1": PRESET_STRATEGIES["放量突破"]["layer1"],
    "layer2": PRESET_STRATEGIES["放量突破"]["layer2"],
    "layer3": PRESET_STRATEGIES["放量突破"]["layer3"],
    "layer4": PRESET_STRATEGIES["放量突破"]["layer4"],
}


async def run_screening(config: dict | None = None) -> int:
    """Run the 4-layer screening funnel and persist results."""
    if config is None:
        config = DEFAULT_CONFIG

    redis: Redis = get_redis()
    today = date.today()
    passed = []

    try:
        async with async_session() as session:
            result = await session.execute(select(Stock))
            stocks = list(result.scalars().all())

        layer1_cfg = config.get("layer1", {})
        layer2_cfg = config.get("layer2", {})
        layer3_cfg = config.get("layer3", {})
        layer4_cfg = config.get("layer4", {})

        # Pre-load sector filter stock set
        sector_filter = layer1_cfg.get("sector_filter", {})
        sector_mode = sector_filter.get("mode", "disabled")
        sector_stock_set: set[str] = set()
        if sector_mode != "disabled" and sector_filter.get("sector_ids"):
            for sid in sector_filter["sector_ids"]:
                members = await redis.smembers(f"sectors:members:{sid}")
                sector_stock_set.update(m.decode() if isinstance(m, bytes) else m for m in members)

        layer1_pass = 0
        layer2_pass = 0
        layer3_pass = 0

        for stock in stocks:
            # Layer 1: Hard exclusion
            if not _pass_layer1(stock, layer1_cfg, sector_mode, sector_stock_set):
                continue
            layer1_pass += 1

            # Get indicators from Redis
            indicator_data = await redis.get(f"indicator:{stock.code}")
            if not indicator_data:
                continue
            indicators = json.loads(indicator_data)

            # Layer 2: Trend confirmation
            l2_result = _pass_layer2(indicators, layer2_cfg)
            if not l2_result["passed"]:
                continue
            layer2_pass += 1

            # Layer 3: Volume-price timing
            l3_result = _pass_layer3(indicators, layer3_cfg)
            if not l3_result["passed"]:
                continue
            layer3_pass += 1

            # Layer 4: Risk control
            l4_result = _pass_layer4(indicators, layer4_cfg)
            if not l4_result["passed"]:
                continue

            # Calculate composite score
            score = l2_result["score"] + l3_result["score"] + l4_result["score"]
            details = {
                "layer2": l2_result["details"],
                "layer3": l3_result["details"],
                "layer4": l4_result["details"],
                # Snapshot key indicators for display (independent of Redis TTL)
                "snapshot": {
                    "close": indicators.get("close"),
                    "amount": indicators.get("amount"),
                    "pct_change": indicators.get("pct_change"),
                    "ma5": indicators.get("ma5"),
                    "ma10": indicators.get("ma10"),
                    "ma20": indicators.get("ma20"),
                    "ma60": indicators.get("ma60"),
                    "macd_hist": indicators.get("macd_hist"),
                    "macd_golden_cross": indicators.get("macd_golden_cross", False),
                    "kdj_golden_cross": indicators.get("kdj_golden_cross", False),
                    "rsi14": indicators.get("rsi14"),
                    "volume_ratio": indicators.get("volume_ratio"),
                    "boll_position": indicators.get("boll_position"),
                    "max_drawdown_20d": indicators.get("max_drawdown_20d"),
                    "ma_aligned": indicators.get("ma_aligned", False),
                },
            }

            passed.append({
                "stock": stock,
                "indicators": indicators,
                "score": score,
                "details": details,
            })

        # Persist results
        async with async_session() as session:
            await session.execute(
                delete(ScreeningResult).where(ScreeningResult.screen_date == today)
            )

            for item in passed:
                sr = ScreeningResult(
                    screen_date=today,
                    stock_code=item["stock"].code,
                    stock_name=item["stock"].name,
                    layer_passed=4,
                    score=item["score"],
                    details=json.dumps(item["details"], ensure_ascii=False),
                )
                session.add(sr)
            await session.commit()

        logger.info(
            f"Screening: {len(stocks)} total → L1:{layer1_pass} → L2:{layer2_pass} "
            f"→ L3:{layer3_pass} → L4:{len(passed)} passed"
        )
        return {
            "total": len(stocks),
            "layer1": layer1_pass,
            "layer2": layer2_pass,
            "layer3": layer3_pass,
            "layer4": len(passed),
        }

    finally:
        await redis.aclose()


def _pass_layer1(
    stock: Stock, cfg: dict, sector_mode: str = "disabled", sector_stocks: set[str] | None = None
) -> bool:
    """Layer 1: Hard exclusion filters."""
    if cfg.get("exclude_st", True) and stock.is_st:
        return False
    if cfg.get("exclude_suspended", True) and stock.is_suspended:
        return False
    if cfg.get("exclude_bse", True) and stock.code.startswith("8"):
        return False
    if cfg.get("exclude_star", True) and stock.code.startswith("688"):
        return False
    # Sector filter
    if sector_mode == "include" and sector_stocks:
        if stock.code not in sector_stocks:
            return False
    elif sector_mode == "exclude" and sector_stocks:
        if stock.code in sector_stocks:
            return False
    return True


def _pass_layer2(indicators: dict, cfg: dict) -> dict:
    """Layer 2: Trend confirmation. Returns {passed, score, details}."""
    details = {}
    score = 0.0

    # MA alignment check
    if cfg.get("require_ma_aligned", True):
        if not indicators.get("ma_aligned", False):
            return {"passed": False, "score": 0, "details": {"fail": "ma_not_aligned"}}
        details["ma_aligned"] = True
        score += 2.0

    # MA convergence check (for 均线粘合 strategy)
    if cfg.get("require_ma_converge", False):
        ma5 = indicators.get("ma5")
        ma10 = indicators.get("ma10")
        ma20 = indicators.get("ma20")
        ma60 = indicators.get("ma60")
        if ma5 is None or ma10 is None or ma20 is None or ma60 is None:
            return {"passed": False, "score": 0, "details": {"fail": "ma_data_missing"}}
        ma_avg = (ma5 + ma10 + ma20 + ma60) / 4
        if ma_avg <= 0:
            return {"passed": False, "score": 0, "details": {"fail": "invalid_ma"}}
        ma_spread = (max(ma5, ma10, ma20, ma60) - min(ma5, ma10, ma20, ma60)) / ma_avg * 100
        threshold = cfg.get("ma_converge_pct", 3.0)
        if ma_spread > threshold:
            return {"passed": False, "score": 0, "details": {"fail": "ma_not_converged", "spread": round(ma_spread, 2)}}
        details["ma_converge_spread"] = round(ma_spread, 2)
        score += 2.5

    # ADX trend strength
    min_adx = cfg.get("min_adx", 0)
    if min_adx > 0:
        adx = indicators.get("adx")
        if adx is None or adx < min_adx:
            return {"passed": False, "score": 0, "details": {"fail": "adx_too_low"}}
        score += 1.0

    if cfg.get("require_trend_strong", False):
        if not indicators.get("trend_strong", False):
            return {"passed": False, "score": 0, "details": {"fail": "trend_weak"}}
        score += 1.5

    # DI direction
    if cfg.get("require_di_bullish", False):
        if not indicators.get("di_bullish", False):
            return {"passed": False, "score": 0, "details": {"fail": "di_bearish"}}
        details["di_bullish"] = True
        score += 1.0

    return {"passed": True, "score": score, "details": details}


def _pass_layer3(indicators: dict, cfg: dict) -> dict:
    """Layer 3: Volume-price timing. Returns {passed, score, details}."""
    details = {}
    score = 0.0

    # Minimum amount
    min_amount = cfg.get("min_amount", 2e8)
    amount = indicators.get("amount", 0)
    if amount < min_amount:
        return {"passed": False, "score": 0, "details": {"fail": "amount_low", "amount": amount}}
    details["amount"] = amount
    score += 1.0

    # Volume ratio
    vol_ratio = indicators.get("volume_ratio")
    min_vol_ratio = cfg.get("min_volume_ratio", 0)
    max_vol_ratio = cfg.get("max_volume_ratio", 999)
    if vol_ratio is not None:
        if min_vol_ratio > 0 and vol_ratio < min_vol_ratio:
            return {"passed": False, "score": 0, "details": {"fail": "vol_ratio_low"}}
        if max_vol_ratio < 999 and vol_ratio > max_vol_ratio:
            return {"passed": False, "score": 0, "details": {"fail": "vol_ratio_high"}}
        details["volume_ratio"] = round(vol_ratio, 2)
        if vol_ratio >= 1.5:
            score += 1.5
        elif vol_ratio >= 1.0:
            score += 0.5

    # MACD conditions
    if cfg.get("require_macd_golden_cross", False):
        if not indicators.get("macd_golden_cross", False):
            return {"passed": False, "score": 0, "details": {"fail": "no_macd_golden_cross"}}
        details["macd_golden_cross"] = True
        score += 2.0

    if cfg.get("require_macd_positive", False):
        macd_hist = indicators.get("macd_hist")
        if macd_hist is None or macd_hist <= 0:
            return {"passed": False, "score": 0, "details": {"fail": "macd_negative"}}
        details["macd_hist"] = round(macd_hist, 4)
        score += 1.0

    # KDJ golden cross
    if cfg.get("require_kdj_golden_cross", False):
        if not indicators.get("kdj_golden_cross", False):
            return {"passed": False, "score": 0, "details": {"fail": "no_kdj_golden_cross"}}
        details["kdj_golden_cross"] = True
        score += 1.5

    # RSI range
    rsi_min = cfg.get("rsi_min", 0)
    rsi_max = cfg.get("rsi_max", 100)
    rsi = indicators.get("rsi14")
    if rsi is not None:
        if rsi < rsi_min or rsi > rsi_max:
            return {"passed": False, "score": 0, "details": {"fail": "rsi_out_of_range", "rsi": round(rsi, 1)}}
        details["rsi14"] = round(rsi, 1)
        # Higher score for RSI in sweet spot (40-60)
        if 40 <= rsi <= 60:
            score += 1.0

    return {"passed": True, "score": score, "details": details}


def _pass_layer4(indicators: dict, cfg: dict) -> dict:
    """Layer 4: Risk control. Returns {passed, score, details}."""
    details = {}
    score = 0.0

    # Max drawdown limit
    max_dd_limit = cfg.get("max_drawdown_limit", 15)
    mdd = indicators.get("max_drawdown_20d")
    if mdd is not None and mdd > max_dd_limit:
        return {"passed": False, "score": 0, "details": {"fail": "drawdown_too_high", "mdd": round(mdd, 1)}}
    if mdd is not None:
        details["max_drawdown_20d"] = round(mdd, 1)
        # Lower drawdown = higher score
        score += max(0, (max_dd_limit - mdd) / max_dd_limit * 2)

    # Consecutive down days limit
    max_consec_down = cfg.get("max_consecutive_down", -3)
    consec = indicators.get("consecutive_up", 0)
    if consec < max_consec_down:
        return {"passed": False, "score": 0, "details": {"fail": "too_many_down_days", "consecutive": consec}}
    details["consecutive_up"] = consec

    # BIAS limits (overbought/oversold)
    max_bias = cfg.get("max_bias", 10)
    min_bias = cfg.get("min_bias", -15)
    bias = indicators.get("bias20")
    if bias is not None:
        if bias > max_bias:
            return {"passed": False, "score": 0, "details": {"fail": "bias_overbought", "bias": round(bias, 2)}}
        if bias < min_bias:
            return {"passed": False, "score": 0, "details": {"fail": "bias_oversold", "bias": round(bias, 2)}}
        details["bias20"] = round(bias, 2)
        score += 0.5

    # Williams %R overbought check
    wr_limit = cfg.get("wr_overbought", 20)
    wr = indicators.get("wr14")
    if wr is not None and wr_limit < 999:
        if wr < wr_limit:  # WR is inverted: lower = more overbought
            return {"passed": False, "score": 0, "details": {"fail": "wr_overbought", "wr": round(wr, 1)}}
        details["wr14"] = round(wr, 1)

    # Bollinger Bands position (don't buy near upper band)
    boll_limit = cfg.get("boll_upper_limit", 0.95)
    boll_pos = indicators.get("boll_position")
    if boll_pos is not None:
        if boll_pos > boll_limit:
            return {"passed": False, "score": 0, "details": {"fail": "near_boll_upper", "boll_pos": round(boll_pos, 3)}}
        details["boll_position"] = round(boll_pos, 3)
        score += 0.5

    return {"passed": True, "score": round(score, 2), "details": details}


def get_preset_strategies() -> dict:
    """Return all preset strategy templates."""
    return {
        name: {"description": s["description"], "config": {k: v for k, v in s.items() if k != "description"}}
        for name, s in PRESET_STRATEGIES.items()
    }
