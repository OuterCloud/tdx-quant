from datetime import date, datetime

from pydantic import BaseModel, Field


class BacktestCreate(BaseModel):
    name: str = Field(..., max_length=100)
    strategy_config: dict  # 4-layer config snapshot
    start_date: date
    end_date: date
    initial_capital: float = 1_000_000.0
    take_profit: float = 0.10
    stop_loss: float = 0.05
    max_hold_days: int = 5
    max_positions: int = 10


class BacktestTradeItem(BaseModel):
    id: int
    stock_code: str
    stock_name: str
    buy_date: date
    buy_price: float
    sell_date: date | None = None
    sell_price: float | None = None
    sell_reason: str | None = None
    pnl: float | None = None
    pnl_pct: float | None = None
    hold_days: int = 0


class BacktestSummary(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    status: str
    initial_capital: float
    take_profit: float
    stop_loss: float
    max_hold_days: int
    max_positions: int
    total_return: float | None = None
    annual_return: float | None = None
    max_drawdown: float | None = None
    sharpe_ratio: float | None = None
    win_rate: float | None = None
    total_trades: int = 0
    profit_trades: int = 0
    created_at: datetime


class EquityCurvePoint(BaseModel):
    date: str
    equity: float
    benchmark: float | None = None


class BacktestDetail(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    status: str
    strategy_config: dict
    initial_capital: float
    take_profit: float
    stop_loss: float
    max_hold_days: int
    max_positions: int
    total_return: float | None = None
    annual_return: float | None = None
    max_drawdown: float | None = None
    sharpe_ratio: float | None = None
    win_rate: float | None = None
    total_trades: int = 0
    profit_trades: int = 0
    equity_curve: list[EquityCurvePoint] = []
    trades: list[BacktestTradeItem] = []
    created_at: datetime
