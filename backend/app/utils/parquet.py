from pathlib import Path

import polars as pl

from app.core.config import settings


def kline_path(market: int, code: str) -> Path:
    return settings.DATA_DIR / "kline" / f"{market}_{code}.parquet"


def read_kline(market: int, code: str) -> pl.DataFrame | None:
    path = kline_path(market, code)
    if not path.exists():
        return None
    return pl.read_parquet(path)


def write_kline(market: int, code: str, df: pl.DataFrame) -> None:
    path = kline_path(market, code)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(path)


def append_kline(market: int, code: str, new_df: pl.DataFrame) -> None:
    existing = read_kline(market, code)
    if existing is not None:
        df = pl.concat([existing, new_df]).unique(subset=["date"], keep="last").sort("date")
    else:
        df = new_df.sort("date")
    write_kline(market, code, df)


def get_last_date(market: int, code: str) -> str | None:
    df = read_kline(market, code)
    if df is None or df.is_empty():
        return None
    return df["date"].max()
