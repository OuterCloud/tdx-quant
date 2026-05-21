from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models.stock import Stock  # noqa: E402, F401
from app.models.data_task import DataTask  # noqa: E402, F401
from app.models.screening import ScreeningResult  # noqa: E402, F401
from app.models.strategy import StrategyConfig  # noqa: E402, F401
from app.models.backtest import BacktestRun, BacktestTrade  # noqa: E402, F401
from app.models.sector import Sector, StockSector  # noqa: E402, F401
