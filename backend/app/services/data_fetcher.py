import asyncio
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import local

import polars as pl
from eltdx import Exchange, KlinePeriod, TdxClient
from loguru import logger

from app.core.config import settings
from app.utils.parquet import append_kline, get_last_date

_thread_local = local()


def _get_client() -> TdxClient:
    """Get a TDX client instance for the current thread."""
    if not hasattr(_thread_local, "client"):
        client = TdxClient()
        client.connect()
        _thread_local.client = client
    return _thread_local.client


def _fetch_stock_list() -> list[dict]:
    """Fetch stock list from TDX."""
    client = _get_client()
    stocks = []

    for exchange in (Exchange.SZ, Exchange.SH):
        codes = client.get_codes_all(exchange)
        for sec in codes:
            if _is_stock_code(sec.exchange, sec.code):
                stocks.append({
                    "code": sec.code,
                    "name": sec.name,
                    "market": 0 if sec.exchange == "sz" else 1,
                })

    return stocks


def _is_stock_code(exchange: str, code: str) -> bool:
    """Filter to only A-share stock codes."""
    if exchange == "sz":
        return code.startswith(("00", "30"))
    if exchange == "sh":
        return code.startswith(("60", "68"))
    return False


def _download_kline(code: str, count: int = 800) -> pl.DataFrame | None:
    """Download K-line data for a single stock with retry."""
    client = _get_client()
    for attempt in range(3):
        try:
            resp = client.get_kline(KlinePeriod.DAY, code, start=0, count=count)
            if not resp or not resp.items:
                return None
            rows = []
            for item in resp.items:
                rows.append({
                    "date": item.time.strftime("%Y-%m-%d"),
                    "open": item.open_price,
                    "high": item.high_price,
                    "low": item.low_price,
                    "close": item.close_price,
                    "volume": float(item.volume),
                    "amount": item.amount,
                })
            return pl.DataFrame(rows)
        except Exception as e:
            logger.warning(f"Retry {attempt+1}/3 for {code}: {e}")
            time.sleep(2**attempt)
            # Reconnect on failure
            try:
                client = TdxClient()
                client.connect()
                _thread_local.client = client
            except Exception:
                pass
    return None


def _code_to_market(code: str) -> int:
    """Infer market from code prefix."""
    if code.startswith(("00", "30")):
        return 0  # SZ
    return 1  # SH


class DataFetcher:
    def __init__(self):
        self._executor = ThreadPoolExecutor(
            max_workers=settings.TDX_MAX_WORKERS,
            thread_name_prefix="tdx-worker",
        )

    async def fetch_stock_list(self) -> list[dict]:
        return await asyncio.to_thread(_fetch_stock_list)

    async def download_all(
        self,
        stocks: list[dict],
        on_progress: Callable | None = None,
        incremental: bool = False,
    ) -> dict:
        """Download K-line data for all stocks using thread pool."""
        total = len(stocks)
        success = 0
        failed = 0
        loop = asyncio.get_event_loop()

        def _worker(stock: dict) -> bool:
            market = stock["market"]
            code = stock["code"]
            try:
                count = 30 if incremental else 800
                df = _download_kline(code, count)
                if df is not None and not df.is_empty():
                    append_kline(market, code, df)
                    return True
            except Exception as e:
                logger.error(f"Failed {code}: {e}")
            return False

        futures = []
        for stock in stocks:
            future = loop.run_in_executor(self._executor, _worker, stock)
            futures.append(future)

        for i, future in enumerate(asyncio.as_completed(futures)):
            result = await future
            if result:
                success += 1
            else:
                failed += 1
            if on_progress:
                await on_progress(i + 1, total, success, failed)

        return {"total": total, "success": success, "failed": failed}

    def shutdown(self):
        self._executor.shutdown(wait=False)
