from datetime import date, datetime
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    strategy_config: Mapped[str] = mapped_column(Text)  # JSON snapshot
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    initial_capital: Mapped[float] = mapped_column(Float, default=1_000_000.0)
    take_profit: Mapped[float] = mapped_column(Float, default=0.10)
    stop_loss: Mapped[float] = mapped_column(Float, default=0.05)
    max_hold_days: Mapped[int] = mapped_column(Integer, default=5)
    max_positions: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # Performance metrics
    total_return: Mapped[float | None] = mapped_column(Float, default=None)
    annual_return: Mapped[float | None] = mapped_column(Float, default=None)
    max_drawdown: Mapped[float | None] = mapped_column(Float, default=None)
    sharpe_ratio: Mapped[float | None] = mapped_column(Float, default=None)
    win_rate: Mapped[float | None] = mapped_column(Float, default=None)
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    profit_trades: Mapped[int] = mapped_column(Integer, default=0)
    equity_curve: Mapped[str | None] = mapped_column(Text, default=None)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    trades: Mapped[list["BacktestTrade"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class BacktestTrade(Base):
    __tablename__ = "backtest_trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("backtest_runs.id", ondelete="CASCADE"))
    stock_code: Mapped[str] = mapped_column(String(10))
    stock_name: Mapped[str] = mapped_column(String(20))
    buy_date: Mapped[date] = mapped_column(Date)
    buy_price: Mapped[float] = mapped_column(Float)
    sell_date: Mapped[date | None] = mapped_column(Date, default=None)
    sell_price: Mapped[float | None] = mapped_column(Float, default=None)
    sell_reason: Mapped[str | None] = mapped_column(String(20), default=None)
    pnl: Mapped[float | None] = mapped_column(Float, default=None)
    pnl_pct: Mapped[float | None] = mapped_column(Float, default=None)
    hold_days: Mapped[int] = mapped_column(Integer, default=0)

    run: Mapped["BacktestRun"] = relationship(back_populates="trades")
