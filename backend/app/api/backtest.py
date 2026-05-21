import asyncio
import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from app.core.database import async_session
from app.models.backtest import BacktestRun, BacktestTrade
from app.schemas.backtest import (
    BacktestCreate,
    BacktestDetail,
    BacktestSummary,
    BacktestTradeItem,
    EquityCurvePoint,
)
from app.services.backtester import run_backtest

router = APIRouter(prefix="/backtest", tags=["backtest"])


@router.post("", response_model=BacktestSummary)
async def create_backtest(req: BacktestCreate):
    """Create and start a new backtest run."""
    async with async_session() as session:
        run = BacktestRun(
            name=req.name,
            strategy_config=json.dumps(req.strategy_config, ensure_ascii=False),
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            take_profit=req.take_profit,
            stop_loss=req.stop_loss,
            max_hold_days=req.max_hold_days,
            max_positions=req.max_positions,
            status="pending",
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        run_id = run.id

    # Launch backtest in background
    asyncio.create_task(run_backtest(run_id))

    async with async_session() as session:
        run = await session.get(BacktestRun, run_id)
        return BacktestSummary(
            id=run.id,
            name=run.name,
            start_date=run.start_date,
            end_date=run.end_date,
            status=run.status,
            initial_capital=run.initial_capital,
            take_profit=run.take_profit,
            stop_loss=run.stop_loss,
            max_hold_days=run.max_hold_days,
            max_positions=run.max_positions,
            total_return=run.total_return,
            annual_return=run.annual_return,
            max_drawdown=run.max_drawdown,
            sharpe_ratio=run.sharpe_ratio,
            win_rate=run.win_rate,
            total_trades=run.total_trades,
            profit_trades=run.profit_trades,
            created_at=run.created_at,
        )


@router.get("", response_model=list[BacktestSummary])
async def list_backtests():
    """List all backtest runs, most recent first."""
    async with async_session() as session:
        result = await session.execute(
            select(BacktestRun).order_by(BacktestRun.created_at.desc())
        )
        runs = result.scalars().all()
        return [
            BacktestSummary(
                id=r.id,
                name=r.name,
                start_date=r.start_date,
                end_date=r.end_date,
                status=r.status,
                initial_capital=r.initial_capital,
                take_profit=r.take_profit,
                stop_loss=r.stop_loss,
                max_hold_days=r.max_hold_days,
                max_positions=r.max_positions,
                total_return=r.total_return,
                annual_return=r.annual_return,
                max_drawdown=r.max_drawdown,
                sharpe_ratio=r.sharpe_ratio,
                win_rate=r.win_rate,
                total_trades=r.total_trades,
                profit_trades=r.profit_trades,
                created_at=r.created_at,
            )
            for r in runs
        ]


@router.get("/{run_id}", response_model=BacktestDetail)
async def get_backtest(run_id: str):
    """Get detailed backtest results including equity curve and trades."""
    async with async_session() as session:
        run = await session.get(BacktestRun, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Backtest not found")

        # Load trades
        result = await session.execute(
            select(BacktestTrade)
            .where(BacktestTrade.run_id == run_id)
            .order_by(BacktestTrade.buy_date)
        )
        trades = result.scalars().all()

        # Parse equity curve
        equity_curve = []
        if run.equity_curve:
            raw_curve = json.loads(run.equity_curve)
            equity_curve = [EquityCurvePoint(**p) for p in raw_curve]

        # Parse strategy config
        strategy_config = json.loads(run.strategy_config) if run.strategy_config else {}

        return BacktestDetail(
            id=run.id,
            name=run.name,
            start_date=run.start_date,
            end_date=run.end_date,
            status=run.status,
            strategy_config=strategy_config,
            initial_capital=run.initial_capital,
            take_profit=run.take_profit,
            stop_loss=run.stop_loss,
            max_hold_days=run.max_hold_days,
            max_positions=run.max_positions,
            total_return=run.total_return,
            annual_return=run.annual_return,
            max_drawdown=run.max_drawdown,
            sharpe_ratio=run.sharpe_ratio,
            win_rate=run.win_rate,
            total_trades=run.total_trades,
            profit_trades=run.profit_trades,
            equity_curve=equity_curve,
            trades=[
                BacktestTradeItem(
                    id=t.id,
                    stock_code=t.stock_code,
                    stock_name=t.stock_name,
                    buy_date=t.buy_date,
                    buy_price=t.buy_price,
                    sell_date=t.sell_date,
                    sell_price=t.sell_price,
                    sell_reason=t.sell_reason,
                    pnl=t.pnl,
                    pnl_pct=t.pnl_pct,
                    hold_days=t.hold_days,
                )
                for t in trades
            ],
            created_at=run.created_at,
        )


@router.delete("/{run_id}")
async def delete_backtest(run_id: str):
    """Delete a backtest run and all its trades."""
    async with async_session() as session:
        run = await session.get(BacktestRun, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Backtest not found")

        await session.execute(
            delete(BacktestTrade).where(BacktestTrade.run_id == run_id)
        )
        await session.delete(run)
        await session.commit()

    return {"message": "Backtest deleted"}
