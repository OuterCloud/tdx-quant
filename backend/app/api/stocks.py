import numpy as np
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select

from app.core.database import async_session
from app.indicators.mytt_fork import KDJ, MA, MACD
from app.models.stock import Stock
from app.schemas.stock import KlineBar, StockDetail, StockIndicators, StockItem
from app.utils.parquet import read_kline

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("")
async def list_stocks(
    q: str = Query("", description="Search by code or name"),
    market: int | None = Query(None, description="Filter by market: 0=SZ, 1=SH"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
) -> dict:
    async with async_session() as session:
        query = select(Stock)

        if q:
            query = query.where(
                or_(Stock.code.contains(q), Stock.name.contains(q))
            )
        if market is not None:
            query = query.where(Stock.market == market)

        # Count
        count_query = select(func.count()).select_from(query.subquery())
        total = await session.scalar(count_query)

        # Paginate
        query = query.order_by(Stock.code).offset((page - 1) * size).limit(size)
        result = await session.execute(query)
        stocks = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [
            StockItem(
                code=s.code,
                name=s.name,
                market=s.market,
                industry=s.industry,
                is_st=s.is_st,
                is_suspended=s.is_suspended,
            )
            for s in stocks
        ],
    }


@router.get("/{code}")
async def get_stock_detail(code: str, days: int = Query(120, ge=30, le=800)) -> StockDetail:
    async with async_session() as session:
        stock = await session.get(Stock, code)
        if not stock:
            raise HTTPException(status_code=404, detail="Stock not found")

    df = read_kline(stock.market, code)
    if df is None or df.is_empty():
        raise HTTPException(status_code=404, detail="No K-line data")

    # Take last N days
    df = df.sort("date").tail(days)

    close = df["close"].to_numpy().astype(np.float64)
    high = df["high"].to_numpy().astype(np.float64)
    low = df["low"].to_numpy().astype(np.float64)

    ma5 = MA(close, 5)
    ma10 = MA(close, 10)
    ma20 = MA(close, 20)
    ma60 = MA(close, 60)
    dif, dea, hist = MACD(close)
    k, d, j = KDJ(high, low, close)

    def to_list(arr):
        return [None if np.isnan(v) else round(float(v), 4) for v in arr]

    klines = [
        KlineBar(
            date=row["date"],
            open=row["open"],
            high=row["high"],
            low=row["low"],
            close=row["close"],
            volume=row["volume"],
            amount=row["amount"],
        )
        for row in df.to_dicts()
    ]

    indicators = StockIndicators(
        ma5=to_list(ma5),
        ma10=to_list(ma10),
        ma20=to_list(ma20),
        ma60=to_list(ma60),
        macd_dif=to_list(dif),
        macd_dea=to_list(dea),
        macd_hist=to_list(hist),
        kdj_k=to_list(k),
        kdj_d=to_list(d),
        kdj_j=to_list(j),
    )

    return StockDetail(
        stock=StockItem(
            code=stock.code,
            name=stock.name,
            market=stock.market,
            industry=stock.industry,
            is_st=stock.is_st,
            is_suspended=stock.is_suspended,
        ),
        klines=klines,
        indicators=indicators,
    )
