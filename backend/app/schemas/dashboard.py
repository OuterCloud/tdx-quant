from pydantic import BaseModel


class MarketOverview(BaseModel):
    total_stocks: int
    trading_stocks: int
    st_stocks: int
    data_updated_at: str | None


class TodaySummary(BaseModel):
    screen_date: str
    total_screened: int
    layer1_passed: int
    layer2_passed: int


class BuyListItem(BaseModel):
    stock_code: str
    stock_name: str
    close: float | None
    amount: float | None
    ma5: float | None
    ma10: float | None
    ma20: float | None
    ma60: float | None
    macd_hist: float | None
    macd_golden_cross: bool
    score: float


class DataStatus(BaseModel):
    has_data: bool
    total_files: int
    last_task_status: str | None
    last_task_time: str | None
    is_busy: bool
