"""Technical indicators implemented with NumPy vectorized operations."""

import numpy as np


def MA(close: np.ndarray, period: int) -> np.ndarray:
    """Simple Moving Average."""
    result = np.full_like(close, np.nan)
    if len(close) < period:
        return result
    cumsum = np.cumsum(close)
    cumsum[period:] = cumsum[period:] - cumsum[:-period]
    result[period - 1 :] = cumsum[period - 1 :] / period
    return result


def EMA(close: np.ndarray, period: int) -> np.ndarray:
    """Exponential Moving Average."""
    result = np.full_like(close, np.nan, dtype=np.float64)
    if len(close) < period:
        return result
    multiplier = 2.0 / (period + 1)
    result[period - 1] = np.mean(close[:period])
    for i in range(period, len(close)):
        result[i] = close[i] * multiplier + result[i - 1] * (1 - multiplier)
    return result


def MACD(
    close: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """MACD indicator. Returns (DIF, DEA, HIST)."""
    ema_fast = EMA(close, fast)
    ema_slow = EMA(close, slow)
    dif = ema_fast - ema_slow
    # Compute DEA as EMA of DIF
    dea = np.full_like(close, np.nan, dtype=np.float64)
    valid_start = slow - 1 + signal - 1
    if len(close) > valid_start:
        dif_valid = dif[slow - 1 :]
        dea_segment = EMA(dif_valid, signal)
        dea[slow - 1 :] = dea_segment
    hist = 2 * (dif - dea)
    return dif, dea, hist


def KDJ(
    high: np.ndarray,
    low: np.ndarray,
    close: np.ndarray,
    n: int = 9,
    m1: int = 3,
    m2: int = 3,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """KDJ indicator. Returns (K, D, J)."""
    length = len(close)
    rsv = np.full(length, np.nan, dtype=np.float64)

    for i in range(n - 1, length):
        window_high = np.max(high[i - n + 1 : i + 1])
        window_low = np.min(low[i - n + 1 : i + 1])
        if window_high != window_low:
            rsv[i] = (close[i] - window_low) / (window_high - window_low) * 100
        else:
            rsv[i] = 50.0

    k = np.full(length, np.nan, dtype=np.float64)
    d = np.full(length, np.nan, dtype=np.float64)

    k[n - 1] = 50.0
    d[n - 1] = 50.0

    for i in range(n, length):
        k[i] = (m1 - 1) / m1 * k[i - 1] + 1 / m1 * rsv[i]
        d[i] = (m2 - 1) / m2 * d[i - 1] + 1 / m2 * k[i]

    j = 3 * k - 2 * d
    return k, d, j


def RSI(close: np.ndarray, period: int = 14) -> np.ndarray:
    """Relative Strength Index."""
    length = len(close)
    result = np.full(length, np.nan, dtype=np.float64)
    if length < period + 1:
        return result

    delta = np.diff(close)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    avg_gain = np.mean(gain[:period])
    avg_loss = np.mean(loss[:period])

    if avg_loss == 0:
        result[period] = 100.0
    else:
        result[period] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)

    for i in range(period, length - 1):
        avg_gain = (avg_gain * (period - 1) + gain[i]) / period
        avg_loss = (avg_loss * (period - 1) + loss[i]) / period
        if avg_loss == 0:
            result[i + 1] = 100.0
        else:
            result[i + 1] = 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)

    return result


def BOLL(
    close: np.ndarray, period: int = 20, nbdev: float = 2.0
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Bollinger Bands. Returns (upper, middle, lower)."""
    middle = MA(close, period)
    length = len(close)
    upper = np.full(length, np.nan, dtype=np.float64)
    lower = np.full(length, np.nan, dtype=np.float64)

    for i in range(period - 1, length):
        std = np.std(close[i - period + 1 : i + 1], ddof=0)
        upper[i] = middle[i] + nbdev * std
        lower[i] = middle[i] - nbdev * std

    return upper, middle, lower


def ATR(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14
) -> np.ndarray:
    """Average True Range."""
    length = len(close)
    tr = np.full(length, np.nan, dtype=np.float64)
    tr[0] = high[0] - low[0]
    for i in range(1, length):
        tr[i] = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))

    result = np.full(length, np.nan, dtype=np.float64)
    if length < period:
        return result
    result[period - 1] = np.mean(tr[:period])
    for i in range(period, length):
        result[i] = (result[i - 1] * (period - 1) + tr[i]) / period
    return result


def ADX(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """ADX indicator. Returns (adx, plus_di, minus_di)."""
    length = len(close)
    plus_dm = np.zeros(length, dtype=np.float64)
    minus_dm = np.zeros(length, dtype=np.float64)

    for i in range(1, length):
        up = high[i] - high[i - 1]
        down = low[i - 1] - low[i]
        if up > down and up > 0:
            plus_dm[i] = up
        if down > up and down > 0:
            minus_dm[i] = down

    atr_arr = ATR(high, low, close, period)

    # Smooth DM
    smooth_plus = np.full(length, np.nan, dtype=np.float64)
    smooth_minus = np.full(length, np.nan, dtype=np.float64)
    smooth_plus[period] = np.sum(plus_dm[1 : period + 1])
    smooth_minus[period] = np.sum(minus_dm[1 : period + 1])

    for i in range(period + 1, length):
        smooth_plus[i] = smooth_plus[i - 1] - smooth_plus[i - 1] / period + plus_dm[i]
        smooth_minus[i] = smooth_minus[i - 1] - smooth_minus[i - 1] / period + minus_dm[i]

    plus_di = np.full(length, np.nan, dtype=np.float64)
    minus_di = np.full(length, np.nan, dtype=np.float64)
    dx = np.full(length, np.nan, dtype=np.float64)

    for i in range(period, length):
        if atr_arr[i] and atr_arr[i] > 0 and not np.isnan(smooth_plus[i]):
            plus_di[i] = 100.0 * smooth_plus[i] / (atr_arr[i] * period)
            minus_di[i] = 100.0 * smooth_minus[i] / (atr_arr[i] * period)
            di_sum = plus_di[i] + minus_di[i]
            if di_sum > 0:
                dx[i] = 100.0 * abs(plus_di[i] - minus_di[i]) / di_sum

    # Smooth ADX
    adx = np.full(length, np.nan, dtype=np.float64)
    start = 2 * period
    if length > start:
        valid_dx = [dx[i] for i in range(period, start) if not np.isnan(dx[i])]
        if valid_dx:
            adx[start - 1] = np.mean(valid_dx)
            for i in range(start, length):
                if not np.isnan(dx[i]) and not np.isnan(adx[i - 1]):
                    adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period

    return adx, plus_di, minus_di


def BIAS(close: np.ndarray, period: int = 20) -> np.ndarray:
    """BIAS (乖离率). Returns percentage deviation from MA."""
    ma = MA(close, period)
    result = np.full_like(close, np.nan, dtype=np.float64)
    for i in range(len(close)):
        if not np.isnan(ma[i]) and ma[i] != 0:
            result[i] = (close[i] - ma[i]) / ma[i] * 100.0
    return result


def WR(
    high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14
) -> np.ndarray:
    """Williams %R."""
    length = len(close)
    result = np.full(length, np.nan, dtype=np.float64)
    for i in range(period - 1, length):
        hh = np.max(high[i - period + 1 : i + 1])
        ll = np.min(low[i - period + 1 : i + 1])
        if hh != ll:
            result[i] = (hh - close[i]) / (hh - ll) * 100.0
    return result


def VOLUME_RATIO(volume: np.ndarray, period: int = 5) -> np.ndarray:
    """Volume ratio: current volume / MA(volume, period)."""
    ma_vol = MA(volume, period)
    result = np.full_like(volume, np.nan, dtype=np.float64)
    for i in range(len(volume)):
        if not np.isnan(ma_vol[i]) and ma_vol[i] > 0:
            result[i] = volume[i] / ma_vol[i]
    return result


def CONSECUTIVE_UP(close: np.ndarray) -> np.ndarray:
    """Count consecutive up days (positive = up, negative = down)."""
    length = len(close)
    result = np.zeros(length, dtype=np.float64)
    for i in range(1, length):
        if close[i] > close[i - 1]:
            result[i] = max(result[i - 1], 0) + 1
        elif close[i] < close[i - 1]:
            result[i] = min(result[i - 1], 0) - 1
        else:
            result[i] = 0
    return result


def MAX_DRAWDOWN(close: np.ndarray, period: int = 20) -> np.ndarray:
    """Rolling max drawdown over N days (as positive percentage)."""
    length = len(close)
    result = np.full(length, np.nan, dtype=np.float64)
    for i in range(period - 1, length):
        window = close[i - period + 1 : i + 1]
        peak = np.maximum.accumulate(window)
        dd = (peak - window) / peak * 100.0
        result[i] = np.max(dd)
    return result
