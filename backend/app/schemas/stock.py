from pydantic import BaseModel


class StockItem(BaseModel):
    code: str
    name: str
    market: int
    industry: str | None
    is_st: bool
    is_suspended: bool


class KlineBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float


class StockIndicators(BaseModel):
    ma5: list[float | None]
    ma10: list[float | None]
    ma20: list[float | None]
    ma60: list[float | None]
    macd_dif: list[float | None]
    macd_dea: list[float | None]
    macd_hist: list[float | None]
    kdj_k: list[float | None]
    kdj_d: list[float | None]
    kdj_j: list[float | None]


class StockDetail(BaseModel):
    stock: StockItem
    klines: list[KlineBar]
    indicators: StockIndicators
