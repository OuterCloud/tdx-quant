"""Backtesting engine: simulates historical trading based on screening strategies.

Trading model:
- Buy: next day open price (signal generated at close → execute next open)
- Sell: take profit / stop loss / max hold days (whichever triggers first)
- Position sizing: equal weight (1/N for N stocks selected on same day)
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import date

import numpy as np
from loguru import logger
from sqlalchemy import select

from app.core.database import async_session
from app.core.logging import publish_log
from app.indicators.mytt_fork import (
    ADX,
    BIAS,
    BOLL,
    CONSECUTIVE_UP,
    KDJ,
    MA,
    MACD,
    MAX_DRAWDOWN,
    RSI,
    VOLUME_RATIO,
    WR,
)
from app.models.backtest import BacktestRun, BacktestTrade
from app.models.stock import Stock
from app.services.screener import _pass_layer1, _pass_layer2, _pass_layer3, _pass_layer4
from app.utils.calendar import trading_days_between
from app.utils.parquet import read_kline


@dataclass
class Position:
    stock_code: str
    stock_name: str
    buy_date: date
    buy_price: float
    shares: float
    buy_day_idx: int  # index in trading_days list


@dataclass
class BacktestEngine:
    """Core backtesting engine."""

    run_id: str
    strategy_config: dict
    start_date: date
    end_date: date
    initial_capital: float = 1_000_000.0
    take_profit: float = 0.10
    stop_loss: float = 0.05
    max_hold_days: int = 5
    max_positions: int = 10

    # Internal state
    cash: float = field(init=False)
    positions: list[Position] = field(default_factory=list, init=False)
    closed_trades: list[dict] = field(default_factory=list, init=False)
    equity_curve: list[dict] = field(default_factory=list, init=False)

    def __post_init__(self):
        self.cash = self.initial_capital

    def run(self, stocks: list[Stock], kline_cache: dict[str, dict]) -> dict:
        """Execute the backtest. Returns performance metrics."""
        trading_days = trading_days_between(self.start_date, self.end_date)
        if not trading_days:
            return {"error": "No trading days in range"}

        layer1_cfg = self.strategy_config.get("layer1", {})
        layer2_cfg = self.strategy_config.get("layer2", {})
        layer3_cfg = self.strategy_config.get("layer3", {})
        layer4_cfg = self.strategy_config.get("layer4", {})

        # Filter stocks by layer1 (static filters)
        eligible_stocks = [s for s in stocks if _pass_layer1(s, layer1_cfg)]

        for day_idx, today in enumerate(trading_days):
            today_str = today.isoformat()

            # Step 1: Check existing positions for sell signals
            self._check_sells(today, day_idx, kline_cache, trading_days)

            # Step 2: Calculate daily equity
            equity = self._calc_equity(today, kline_cache)
            self.equity_curve.append({"date": today_str, "equity": round(equity, 2)})

            # Step 3: Run screening on eligible stocks (using data up to today)
            if day_idx < len(trading_days) - 1:  # Can't buy on last day
                selected = self._screen_stocks(
                    eligible_stocks, today, kline_cache,
                    layer2_cfg, layer3_cfg, layer4_cfg,
                )

                # Step 4: Buy selected stocks at next day's open
                if selected and len(self.positions) < self.max_positions:
                    next_day = trading_days[day_idx + 1]
                    available_slots = self.max_positions - len(self.positions)
                    to_buy = selected[:available_slots]
                    self._execute_buys(to_buy, next_day, kline_cache)

        # Force close all remaining positions at last day's close
        if trading_days:
            self._force_close_all(trading_days[-1], kline_cache)

        # Calculate performance metrics
        return self._calc_performance(trading_days)

    def _check_sells(
        self, today: date, day_idx: int,
        kline_cache: dict[str, dict], trading_days: list[date],
    ):
        """Check positions for take profit / stop loss / max hold triggers."""
        remaining = []
        for pos in self.positions:
            kdata = kline_cache.get(pos.stock_code)
            if not kdata:
                remaining.append(pos)
                continue

            today_str = today.isoformat()
            dates = kdata["dates"]
            if today_str not in dates:
                remaining.append(pos)
                continue

            idx = dates[today_str]
            high_price = kdata["high"][idx]
            low_price = kdata["low"][idx]
            close_price = kdata["close"][idx]

            hold_days = day_idx - pos.buy_day_idx
            pct_from_buy = (close_price - pos.buy_price) / pos.buy_price
            high_pct = (high_price - pos.buy_price) / pos.buy_price
            low_pct = (low_price - pos.buy_price) / pos.buy_price

            sell_reason = None
            sell_price = close_price

            # Check stop loss first (intraday low)
            if low_pct <= -self.stop_loss:
                sell_reason = "stop_loss"
                sell_price = pos.buy_price * (1 - self.stop_loss)
            # Check take profit (intraday high)
            elif high_pct >= self.take_profit:
                sell_reason = "take_profit"
                sell_price = pos.buy_price * (1 + self.take_profit)
            # Check max hold days
            elif hold_days >= self.max_hold_days:
                sell_reason = "max_hold"
                sell_price = close_price

            if sell_reason:
                pnl = (sell_price - pos.buy_price) * pos.shares
                pnl_pct = (sell_price - pos.buy_price) / pos.buy_price
                self.cash += sell_price * pos.shares
                self.closed_trades.append({
                    "stock_code": pos.stock_code,
                    "stock_name": pos.stock_name,
                    "buy_date": pos.buy_date,
                    "buy_price": pos.buy_price,
                    "sell_date": today,
                    "sell_price": round(sell_price, 4),
                    "sell_reason": sell_reason,
                    "pnl": round(pnl, 2),
                    "pnl_pct": round(pnl_pct, 4),
                    "hold_days": hold_days,
                })
            else:
                remaining.append(pos)

        self.positions = remaining

    def _screen_stocks(
        self, stocks: list[Stock], today: date,
        kline_cache: dict[str, dict],
        layer2_cfg: dict, layer3_cfg: dict, layer4_cfg: dict,
    ) -> list[tuple[Stock, float]]:
        """Run 4-layer screening using historical data up to today."""
        today_str = today.isoformat()
        results = []

        for stock in stocks:
            # Skip if already in portfolio
            if any(p.stock_code == stock.code for p in self.positions):
                continue

            kdata = kline_cache.get(stock.code)
            if not kdata:
                continue

            dates = kdata["dates"]
            if today_str not in dates:
                continue

            idx = dates[today_str]
            if idx < 60:  # Need enough history for indicators
                continue

            # Compute indicators using data up to today
            indicators = self._compute_indicators(kdata, idx)
            if indicators is None:
                continue

            # Layer 2-4 screening
            l2 = _pass_layer2(indicators, layer2_cfg)
            if not l2["passed"]:
                continue

            l3 = _pass_layer3(indicators, layer3_cfg)
            if not l3["passed"]:
                continue

            l4 = _pass_layer4(indicators, layer4_cfg)
            if not l4["passed"]:
                continue

            score = l2["score"] + l3["score"] + l4["score"]
            results.append((stock, score))

        # Sort by score descending
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def _compute_indicators(self, kdata: dict, end_idx: int) -> dict | None:
        """Compute technical indicators for a stock up to end_idx."""
        # Use data from 0 to end_idx (inclusive)
        n = end_idx + 1
        close = kdata["close"][:n]
        high = kdata["high"][:n]
        low = kdata["low"][:n]
        volume = kdata["volume"][:n]
        amount = kdata["amount"][:n]

        if len(close) < 60:
            return None

        last = len(close) - 1
        prev = last - 1

        ma5 = MA(close, 5)
        ma10 = MA(close, 10)
        ma20 = MA(close, 20)
        ma60 = MA(close, 60)

        dif, dea, hist = MACD(close)
        k, d, j = KDJ(high, low, close)
        rsi14 = RSI(close, 14)
        boll_upper, boll_mid, boll_lower = BOLL(close, 20, 2.0)
        adx_val, plus_di, minus_di = ADX(high, low, close, 14)
        bias20 = BIAS(close, 20)
        wr14 = WR(high, low, close, 14)
        vol_ratio = VOLUME_RATIO(volume, 5)
        consec = CONSECUTIVE_UP(close)
        mdd20 = MAX_DRAWDOWN(close, 20)

        def safe(val):
            if val is None or (isinstance(val, float) and np.isnan(val)):
                return None
            v = float(val)
            return None if np.isnan(v) else v

        ma_aligned = bool(
            not np.isnan(ma60[last])
            and ma5[last] > ma10[last] > ma20[last] > ma60[last]
        )

        macd_golden_cross = bool(
            not np.isnan(dif[last]) and not np.isnan(dea[last])
            and not np.isnan(dif[prev]) and not np.isnan(dea[prev])
            and dif[prev] <= dea[prev] and dif[last] > dea[last]
        )

        kdj_golden_cross = bool(
            not np.isnan(k[last]) and not np.isnan(d[last])
            and not np.isnan(k[prev]) and not np.isnan(d[prev])
            and k[prev] <= d[prev] and k[last] > d[last]
        )

        boll_position = None
        if not np.isnan(boll_upper[last]) and not np.isnan(boll_lower[last]):
            boll_width = boll_upper[last] - boll_lower[last]
            if boll_width > 0:
                boll_position = (close[last] - boll_lower[last]) / boll_width

        trend_strong = bool(not np.isnan(adx_val[last]) and adx_val[last] > 25)
        di_bullish = bool(
            not np.isnan(plus_di[last]) and not np.isnan(minus_di[last])
            and plus_di[last] > minus_di[last]
        )

        return {
            "close": float(close[last]),
            "amount": float(amount[last]),
            "ma5": safe(ma5[last]),
            "ma10": safe(ma10[last]),
            "ma20": safe(ma20[last]),
            "ma60": safe(ma60[last]),
            "macd_dif": safe(dif[last]),
            "macd_dea": safe(dea[last]),
            "macd_hist": safe(hist[last]),
            "macd_golden_cross": macd_golden_cross,
            "kdj_golden_cross": kdj_golden_cross,
            "rsi14": safe(rsi14[last]),
            "boll_position": round(boll_position, 4) if boll_position is not None else None,
            "adx": safe(adx_val[last]),
            "trend_strong": trend_strong,
            "di_bullish": di_bullish,
            "bias20": safe(bias20[last]),
            "wr14": safe(wr14[last]),
            "volume_ratio": safe(vol_ratio[last]),
            "consecutive_up": int(consec[last]),
            "max_drawdown_20d": safe(mdd20[last]),
            "ma_aligned": ma_aligned,
        }

    def _execute_buys(
        self, selected: list[tuple[Stock, float]],
        buy_date: date, kline_cache: dict[str, dict],
    ):
        """Buy selected stocks at buy_date's open price with equal weight."""
        buy_date_str = buy_date.isoformat()
        buyable = []

        for stock, _score in selected:
            kdata = kline_cache.get(stock.code)
            if not kdata:
                continue
            if buy_date_str not in kdata["dates"]:
                continue
            idx = kdata["dates"][buy_date_str]
            open_price = kdata["open"][idx]
            if open_price > 0:
                buyable.append((stock, open_price, idx))

        if not buyable:
            return

        # Equal weight allocation
        capital_per_stock = self.cash / len(buyable)

        # Find buy_day_idx in trading_days context
        trading_days = trading_days_between(self.start_date, self.end_date)
        buy_day_idx = 0
        for i, td in enumerate(trading_days):
            if td == buy_date:
                buy_day_idx = i
                break

        for stock, open_price, _idx in buyable:
            shares = int(capital_per_stock / open_price / 100) * 100  # Round to lots of 100
            if shares <= 0:
                continue
            cost = shares * open_price
            if cost > self.cash:
                continue
            self.cash -= cost
            self.positions.append(Position(
                stock_code=stock.code,
                stock_name=stock.name,
                buy_date=buy_date,
                buy_price=open_price,
                shares=shares,
                buy_day_idx=buy_day_idx,
            ))

    def _force_close_all(self, last_day: date, kline_cache: dict[str, dict]):
        """Force close all open positions at last day's close."""
        last_day_str = last_day.isoformat()
        trading_days = trading_days_between(self.start_date, self.end_date)
        last_day_idx = len(trading_days) - 1

        for pos in self.positions:
            kdata = kline_cache.get(pos.stock_code)
            sell_price = pos.buy_price  # fallback
            if kdata and last_day_str in kdata["dates"]:
                idx = kdata["dates"][last_day_str]
                sell_price = kdata["close"][idx]

            hold_days = last_day_idx - pos.buy_day_idx
            pnl = (sell_price - pos.buy_price) * pos.shares
            pnl_pct = (sell_price - pos.buy_price) / pos.buy_price

            self.cash += sell_price * pos.shares
            self.closed_trades.append({
                "stock_code": pos.stock_code,
                "stock_name": pos.stock_name,
                "buy_date": pos.buy_date,
                "buy_price": pos.buy_price,
                "sell_date": last_day,
                "sell_price": round(sell_price, 4),
                "sell_reason": "end_of_backtest",
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 4),
                "hold_days": hold_days,
            })
        self.positions = []

    def _calc_equity(self, today: date, kline_cache: dict[str, dict]) -> float:
        """Calculate total portfolio value (cash + positions market value)."""
        today_str = today.isoformat()
        market_value = 0.0
        for pos in self.positions:
            kdata = kline_cache.get(pos.stock_code)
            if kdata and today_str in kdata["dates"]:
                idx = kdata["dates"][today_str]
                market_value += kdata["close"][idx] * pos.shares
            else:
                market_value += pos.buy_price * pos.shares
        return self.cash + market_value

    def _calc_performance(self, trading_days: list[date]) -> dict:
        """Calculate overall performance metrics."""
        if not self.equity_curve:
            return {}

        equities = [p["equity"] for p in self.equity_curve]
        final_equity = equities[-1]
        total_return = (final_equity - self.initial_capital) / self.initial_capital

        # Annualized return
        n_days = len(trading_days)
        n_years = n_days / 252.0
        annual_return = (1 + total_return) ** (1 / n_years) - 1 if n_years > 0 else 0

        # Max drawdown
        peak = equities[0]
        max_dd = 0.0
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak
            if dd > max_dd:
                max_dd = dd

        # Sharpe ratio (annualized, assuming risk-free = 3%)
        if len(equities) > 1:
            daily_returns = np.diff(equities) / equities[:-1]
            avg_daily = np.mean(daily_returns)
            std_daily = np.std(daily_returns)
            sharpe = (avg_daily - 0.03 / 252) / std_daily * np.sqrt(252) if std_daily > 0 else 0
        else:
            sharpe = 0.0

        # Win rate
        total_trades = len(self.closed_trades)
        profit_trades = sum(1 for t in self.closed_trades if (t.get("pnl") or 0) > 0)
        win_rate = profit_trades / total_trades if total_trades > 0 else 0

        return {
            "total_return": round(total_return, 4),
            "annual_return": round(annual_return, 4),
            "max_drawdown": round(max_dd, 4),
            "sharpe_ratio": round(float(sharpe), 4),
            "win_rate": round(win_rate, 4),
            "total_trades": total_trades,
            "profit_trades": profit_trades,
        }


def _load_kline_cache(stocks: list[Stock]) -> dict[str, dict]:
    """Load all kline data into memory as numpy arrays with date index."""
    cache = {}
    for stock in stocks:
        df = read_kline(stock.market, stock.code)
        if df is None or len(df) < 60:
            continue

        dates_list = df["date"].to_list()
        # Build date -> index mapping
        date_index = {}
        for i, d in enumerate(dates_list):
            # Handle both string and date types
            if isinstance(d, str):
                date_index[d] = i
            else:
                date_index[d.isoformat() if hasattr(d, "isoformat") else str(d)] = i

        cache[stock.code] = {
            "dates": date_index,
            "open": df["open"].to_numpy().astype(np.float64),
            "close": df["close"].to_numpy().astype(np.float64),
            "high": df["high"].to_numpy().astype(np.float64),
            "low": df["low"].to_numpy().astype(np.float64),
            "volume": df["volume"].to_numpy().astype(np.float64),
            "amount": df["amount"].to_numpy().astype(np.float64),
        }
    return cache


async def run_backtest(run_id: str):
    """Main entry point: load data, run engine, persist results."""
    async with async_session() as session:
        run = await session.get(BacktestRun, run_id)
        if not run:
            logger.error(f"Backtest run {run_id} not found")
            return

        run.status = "running"
        await session.commit()

    await publish_log(f"回测开始: {run.name} ({run.start_date} ~ {run.end_date})")

    try:
        # Load stocks
        async with async_session() as session:
            result = await session.execute(select(Stock))
            stocks = list(result.scalars().all())

        strategy_config = json.loads(run.strategy_config)

        # Load kline data (CPU-bound, run in thread)
        kline_cache = await asyncio.to_thread(_load_kline_cache, stocks)
        await publish_log(f"已加载 {len(kline_cache)} 只股票K线数据")

        # Run backtest engine (CPU-bound)
        engine = BacktestEngine(
            run_id=run_id,
            strategy_config=strategy_config,
            start_date=run.start_date,
            end_date=run.end_date,
            initial_capital=run.initial_capital,
            take_profit=run.take_profit,
            stop_loss=run.stop_loss,
            max_hold_days=run.max_hold_days,
            max_positions=run.max_positions,
        )

        metrics = await asyncio.to_thread(engine.run, stocks, kline_cache)

        if "error" in metrics:
            async with async_session() as session:
                run = await session.get(BacktestRun, run_id)
                run.status = "failed"
                await session.commit()
            await publish_log(f"回测失败: {metrics['error']}", level="ERROR")
            return

        # Persist results
        async with async_session() as session:
            run = await session.get(BacktestRun, run_id)
            run.status = "done"
            run.total_return = metrics.get("total_return")
            run.annual_return = metrics.get("annual_return")
            run.max_drawdown = metrics.get("max_drawdown")
            run.sharpe_ratio = metrics.get("sharpe_ratio")
            run.win_rate = metrics.get("win_rate")
            run.total_trades = metrics.get("total_trades", 0)
            run.profit_trades = metrics.get("profit_trades", 0)
            run.equity_curve = json.dumps(engine.equity_curve, ensure_ascii=False)

            # Save trades
            for t in engine.closed_trades:
                trade = BacktestTrade(
                    run_id=run_id,
                    stock_code=t["stock_code"],
                    stock_name=t["stock_name"],
                    buy_date=t["buy_date"],
                    buy_price=t["buy_price"],
                    sell_date=t["sell_date"],
                    sell_price=t["sell_price"],
                    sell_reason=t["sell_reason"],
                    pnl=t["pnl"],
                    pnl_pct=t["pnl_pct"],
                    hold_days=t["hold_days"],
                )
                session.add(trade)

            await session.commit()

        await publish_log(
            f"回测完成: {run.name} | 总收益 {metrics.get('total_return', 0):.2%} | "
            f"最大回撤 {metrics.get('max_drawdown', 0):.2%} | "
            f"交易 {metrics.get('total_trades', 0)} 笔"
        )

    except Exception as e:
        logger.exception(f"Backtest failed: {e}")
        async with async_session() as session:
            run = await session.get(BacktestRun, run_id)
            if run:
                run.status = "failed"
                await session.commit()
        await publish_log(f"回测异常: {e}", level="ERROR")
