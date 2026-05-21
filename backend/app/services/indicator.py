import asyncio
import json

import numpy as np
from loguru import logger
from redis.asyncio import Redis

from app.core.redis import get_redis
from app.indicators.mytt_fork import (
    ADX,
    ATR,
    BIAS,
    BOLL,
    CONSECUTIVE_UP,
    EMA,
    KDJ,
    MA,
    MACD,
    MAX_DRAWDOWN,
    RSI,
    VOLUME_RATIO,
    WR,
)
from app.utils.parquet import read_kline

INDICATOR_TTL = 86400  # 24 hours


def _safe_float(val) -> float | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)


def _compute_for_stock(market: int, code: str) -> dict | None:
    """Compute all indicators for a single stock. Returns dict or None."""
    df = read_kline(market, code)
    if df is None or len(df) < 60:
        return None

    close = df["close"].to_numpy().astype(np.float64)
    high = df["high"].to_numpy().astype(np.float64)
    low = df["low"].to_numpy().astype(np.float64)
    volume = df["volume"].to_numpy().astype(np.float64)
    amount = df["amount"].to_numpy().astype(np.float64)

    last = len(close) - 1
    prev = last - 1

    # Moving averages
    ma5 = MA(close, 5)
    ma10 = MA(close, 10)
    ma20 = MA(close, 20)
    ma60 = MA(close, 60)

    # MACD
    dif, dea, hist = MACD(close)

    # KDJ
    k, d, j = KDJ(high, low, close)

    # RSI
    rsi6 = RSI(close, 6)
    rsi12 = RSI(close, 12)
    rsi14 = RSI(close, 14)

    # Bollinger Bands
    boll_upper, boll_mid, boll_lower = BOLL(close, 20, 2.0)

    # ATR
    atr14 = ATR(high, low, close, 14)

    # ADX
    adx_val, plus_di, minus_di = ADX(high, low, close, 14)

    # BIAS
    bias20 = BIAS(close, 20)

    # Williams %R
    wr14 = WR(high, low, close, 14)

    # Volume ratio
    vol_ratio = VOLUME_RATIO(volume, 5)

    # Consecutive up/down
    consec = CONSECUTIVE_UP(close)

    # Max drawdown
    mdd20 = MAX_DRAWDOWN(close, 20)

    # Derived signals
    # MA alignment: MA5 > MA10 > MA20 > MA60
    ma_aligned = bool(
        not np.isnan(ma60[last])
        and ma5[last] > ma10[last] > ma20[last] > ma60[last]
    )

    # MACD golden cross: DIF crosses above DEA
    macd_golden_cross = bool(
        not np.isnan(dif[last])
        and not np.isnan(dea[last])
        and not np.isnan(dif[prev])
        and not np.isnan(dea[prev])
        and dif[prev] <= dea[prev]
        and dif[last] > dea[last]
    )

    # MACD dead cross
    macd_dead_cross = bool(
        not np.isnan(dif[last])
        and not np.isnan(dea[last])
        and not np.isnan(dif[prev])
        and not np.isnan(dea[prev])
        and dif[prev] >= dea[prev]
        and dif[last] < dea[last]
    )

    # KDJ golden cross
    kdj_golden_cross = bool(
        not np.isnan(k[last])
        and not np.isnan(d[last])
        and not np.isnan(k[prev])
        and not np.isnan(d[prev])
        and k[prev] <= d[prev]
        and k[last] > d[last]
    )

    # Price vs Bollinger Bands
    boll_position = None
    if not np.isnan(boll_upper[last]) and not np.isnan(boll_lower[last]):
        boll_width = boll_upper[last] - boll_lower[last]
        if boll_width > 0:
            boll_position = (close[last] - boll_lower[last]) / boll_width

    # Trend strength (ADX > 25 indicates strong trend)
    trend_strong = bool(
        not np.isnan(adx_val[last]) and adx_val[last] > 25
    )

    # DI crossover (+DI > -DI = bullish)
    di_bullish = bool(
        not np.isnan(plus_di[last])
        and not np.isnan(minus_di[last])
        and plus_di[last] > minus_di[last]
    )

    # Price change
    pct_change = (close[last] - close[prev]) / close[prev] * 100 if close[prev] > 0 else 0

    # 5-day price change
    pct_change_5d = None
    if last >= 5 and close[last - 5] > 0:
        pct_change_5d = (close[last] - close[last - 5]) / close[last - 5] * 100

    # 20-day price change
    pct_change_20d = None
    if last >= 20 and close[last - 20] > 0:
        pct_change_20d = (close[last] - close[last - 20]) / close[last - 20] * 100

    # Volume MA
    vol_ma5 = MA(volume, 5)

    return {
        # Price
        "close": float(close[last]),
        "high": float(high[last]),
        "low": float(low[last]),
        "volume": float(volume[last]),
        "amount": float(amount[last]),
        "pct_change": round(pct_change, 2),
        "pct_change_5d": round(pct_change_5d, 2) if pct_change_5d is not None else None,
        "pct_change_20d": round(pct_change_20d, 2) if pct_change_20d is not None else None,
        # Moving averages
        "ma5": _safe_float(ma5[last]),
        "ma10": _safe_float(ma10[last]),
        "ma20": _safe_float(ma20[last]),
        "ma60": _safe_float(ma60[last]),
        # MACD
        "macd_dif": _safe_float(dif[last]),
        "macd_dea": _safe_float(dea[last]),
        "macd_hist": _safe_float(hist[last]),
        "macd_golden_cross": macd_golden_cross,
        "macd_dead_cross": macd_dead_cross,
        # KDJ
        "kdj_k": _safe_float(k[last]),
        "kdj_d": _safe_float(d[last]),
        "kdj_j": _safe_float(j[last]),
        "kdj_golden_cross": kdj_golden_cross,
        # RSI
        "rsi6": _safe_float(rsi6[last]),
        "rsi12": _safe_float(rsi12[last]),
        "rsi14": _safe_float(rsi14[last]),
        # Bollinger Bands
        "boll_upper": _safe_float(boll_upper[last]),
        "boll_mid": _safe_float(boll_mid[last]),
        "boll_lower": _safe_float(boll_lower[last]),
        "boll_position": round(boll_position, 4) if boll_position is not None else None,
        # ATR
        "atr14": _safe_float(atr14[last]),
        # ADX
        "adx": _safe_float(adx_val[last]),
        "plus_di": _safe_float(plus_di[last]),
        "minus_di": _safe_float(minus_di[last]),
        "trend_strong": trend_strong,
        "di_bullish": di_bullish,
        # BIAS
        "bias20": _safe_float(bias20[last]),
        # Williams %R
        "wr14": _safe_float(wr14[last]),
        # Volume
        "volume_ratio": _safe_float(vol_ratio[last]),
        "vol_ma5": _safe_float(vol_ma5[last]),
        # Consecutive days
        "consecutive_up": int(consec[last]),
        # Max drawdown
        "max_drawdown_20d": _safe_float(mdd20[last]),
        # Composite signals
        "ma_aligned": ma_aligned,
    }


async def compute_all_indicators(stocks: list[dict]):
    """Compute indicators for all stocks and cache to Redis."""
    redis: Redis = get_redis()
    try:
        computed = 0
        for stock in stocks:
            result = await asyncio.to_thread(
                _compute_for_stock, stock["market"], stock["code"]
            )
            if result:
                key = f"indicator:{stock['code']}"
                await redis.set(key, json.dumps(result), ex=INDICATOR_TTL)
                computed += 1
        logger.info(f"Computed indicators for {computed}/{len(stocks)} stocks")
    finally:
        await redis.aclose()


async def get_indicator(code: str) -> dict | None:
    """Get cached indicator for a stock."""
    redis: Redis = get_redis()
    try:
        data = await redis.get(f"indicator:{code}")
        if data:
            return json.loads(data)
        return None
    finally:
        await redis.aclose()
