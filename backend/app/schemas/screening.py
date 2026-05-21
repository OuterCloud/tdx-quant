from pydantic import BaseModel


class SectorFilter(BaseModel):
    mode: str = "disabled"  # "include" | "exclude" | "disabled"
    sector_ids: list[int] = []


class Layer1Config(BaseModel):
    exclude_st: bool = True
    exclude_suspended: bool = True
    exclude_bse: bool = True
    exclude_star: bool = True
    sector_filter: SectorFilter = SectorFilter()


class Layer2Config(BaseModel):
    require_ma_aligned: bool = True
    require_ma_converge: bool = False
    ma_converge_pct: float = 3.0
    ma_periods: list[int] = [5, 10, 20, 60]
    require_trend_strong: bool = False
    require_di_bullish: bool = True
    min_adx: float = 0


class Layer3Config(BaseModel):
    min_amount: float = 2e8
    min_volume_ratio: float = 1.5
    max_volume_ratio: float = 999
    require_macd_golden_cross: bool = True
    require_macd_positive: bool = False
    require_kdj_golden_cross: bool = False
    rsi_min: float = 40
    rsi_max: float = 80


class Layer4Config(BaseModel):
    max_drawdown_limit: float = 15
    max_consecutive_down: int = -3
    max_bias: float = 10
    min_bias: float = -15
    wr_overbought: float = 20
    boll_upper_limit: float = 0.95


class ScreeningConfig(BaseModel):
    active_preset: str | None = "放量突破"
    layer1: Layer1Config = Layer1Config()
    layer2: Layer2Config = Layer2Config()
    layer3: Layer3Config = Layer3Config()
    layer4: Layer4Config = Layer4Config()


class PresetStrategy(BaseModel):
    name: str
    description: str
    config: ScreeningConfig


class ScreeningResultItem(BaseModel):
    stock_code: str
    stock_name: str
    close: float | None = None
    amount: float | None = None
    pct_change: float | None = None
    volume_ratio: float | None = None
    rsi14: float | None = None
    macd_hist: float | None = None
    macd_golden_cross: bool = False
    kdj_golden_cross: bool = False
    ma_aligned: bool = False
    boll_position: float | None = None
    max_drawdown_20d: float | None = None
    score: float
    details: str | None = None


class ScreeningRunResponse(BaseModel):
    count: int
    message: str
