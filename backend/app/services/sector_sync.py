"""Sector data synchronization from 东方财富 datacenter-web API.

Uses RPT_F10_CORETHEME_BOARDTYPE report which returns all stock-board associations.
We paginate through ~90k records to build the complete sector mapping.
"""

import asyncio
import json
from collections import defaultdict
from datetime import datetime

import httpx
from loguru import logger
from redis.asyncio import Redis
from sqlalchemy import delete, select

from app.core.database import async_session
from app.core.logging import publish_log
from app.core.redis import get_redis
from app.models.data_task import DataTask
from app.models.sector import Sector, StockSector

API_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
PAGE_SIZE = 1000
REQUEST_DELAY = 0.3  # 300ms between requests
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://data.eastmoney.com/",
    "Accept": "application/json, text/plain, */*",
}


async def _fetch_page(client: httpx.AsyncClient, page: int) -> tuple[list[dict], int]:
    """Fetch one page of stock-board associations. Returns (items, total_count)."""
    params = {
        "reportName": "RPT_F10_CORETHEME_BOARDTYPE",
        "columns": "BOARD_CODE,BOARD_NAME,SECURITY_CODE",
        "pageNumber": str(page),
        "pageSize": str(PAGE_SIZE),
        "source": "WEB",
        "client": "WEB",
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.get(API_URL, params=params, headers=HEADERS)
            data = resp.json()
            if not data.get("success"):
                msg = data.get("message", "unknown error")
                raise RuntimeError(f"API error: {msg}")
            result = data.get("result")
            if not result:
                return [], 0
            items = result.get("data") or []
            total = result.get("count", 0)
            return items, total
        except (httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError) as e:
            if attempt < MAX_RETRIES - 1:
                wait = (attempt + 1) * 2
                logger.warning(f"Page {page} fetch failed (attempt {attempt + 1}), retrying in {wait}s: {e}")
                await asyncio.sleep(wait)
            else:
                raise
    return [], 0


async def _fetch_all_associations(client: httpx.AsyncClient, task_id: str) -> tuple[dict[str, str], dict[str, set[str]]]:
    """Fetch all stock-board associations by paginating through the API.

    Returns:
        boards: dict of {board_code: board_name}
        members: dict of {board_code: set of stock_codes}
    """
    boards: dict[str, str] = {}
    members: dict[str, set[str]] = defaultdict(set)

    # First request to get total count
    items, total = await _fetch_page(client, 1)
    if total == 0:
        raise RuntimeError("未获取到板块数据，请检查网络连接")

    total_pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    await publish_log(f"[sector_sync:progress] 共 {total} 条记录，{total_pages} 页", "INFO")

    # Update task total
    async with async_session() as session:
        task = await session.get(DataTask, task_id)
        if task:
            task.total = total_pages
            await session.commit()

    # Process first page
    for item in items:
        code = item.get("BOARD_CODE", "")
        name = item.get("BOARD_NAME", "")
        stock_code = item.get("SECURITY_CODE", "")
        if code and name:
            boards[code] = name
            if stock_code:
                members[code].add(stock_code)

    # Fetch remaining pages
    for page in range(2, total_pages + 1):
        await asyncio.sleep(REQUEST_DELAY)
        items, _ = await _fetch_page(client, page)
        for item in items:
            code = item.get("BOARD_CODE", "")
            name = item.get("BOARD_NAME", "")
            stock_code = item.get("SECURITY_CODE", "")
            if code and name:
                boards[code] = name
                if stock_code:
                    members[code].add(stock_code)

        # Update progress
        if page % 10 == 0 or page == total_pages:
            await publish_log(
                f"[sector_sync:progress] 获取数据: {page}/{total_pages} 页",
                "INFO",
            )
            async with async_session() as session:
                task = await session.get(DataTask, task_id)
                if task:
                    task.progress = page
                    await session.commit()

    return boards, members


async def run_sector_sync(task_id: str):
    """Run full sector data synchronization."""
    try:
        await publish_log("[sector_sync:start] 开始同步板块数据...", "INFO")

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            boards, members = await _fetch_all_associations(client, task_id)

        total_boards = len(boards)
        if total_boards == 0:
            raise RuntimeError("未获取到板块数据")

        await publish_log(f"[sector_sync:progress] 解析完成: {total_boards} 个概念板块", "INFO")

        # Write to database (full replace in transaction)
        await publish_log("[sector_sync:progress] 写入数据库...", "INFO")
        async with async_session() as session:
            # Clear existing stock_sectors
            await session.execute(delete(StockSector))

            # Upsert sectors and insert associations
            for board_code, board_name in boards.items():
                stock_codes = members.get(board_code, set())
                existing = await session.execute(
                    select(Sector).where(Sector.code == board_code)
                )
                sector = existing.scalar_one_or_none()
                if sector:
                    sector.name = board_name
                    sector.stock_count = len(stock_codes)
                    sector.updated_at = datetime.now()
                else:
                    sector = Sector(
                        code=board_code,
                        name=board_name,
                        board_type="concept",
                        stock_count=len(stock_codes),
                    )
                    session.add(sector)
                    await session.flush()

                # Insert stock-sector associations
                for stock_code in stock_codes:
                    session.add(StockSector(stock_code=stock_code, sector_id=sector.id))

            await session.commit()

        # Update Redis cache
        await publish_log("[sector_sync:progress] 更新缓存...", "INFO")
        redis: Redis = get_redis()
        try:
            # Build sectors list for frontend
            sectors_list_cache = []
            async with async_session() as session:
                result = await session.execute(
                    select(Sector).order_by(Sector.stock_count.desc())
                )
                all_sectors = list(result.scalars().all())

            for s in all_sectors:
                sectors_list_cache.append({
                    "id": s.id,
                    "code": s.code,
                    "name": s.name,
                    "board_type": s.board_type,
                    "stock_count": s.stock_count,
                })

            await redis.set("sectors:list", json.dumps(sectors_list_cache, ensure_ascii=False))
            await redis.set("sectors:synced_at", datetime.now().isoformat())

            # Build member sets per sector
            for s in all_sectors:
                stock_codes = members.get(s.code, set())
                if stock_codes:
                    key = f"sectors:members:{s.id}"
                    await redis.delete(key)
                    await redis.sadd(key, *stock_codes)
        finally:
            await redis.aclose()

        # Mark task done
        async with async_session() as session:
            task = await session.get(DataTask, task_id)
            if task:
                task.status = "done"
                task.finished_at = datetime.now()
                task.message = f"同步完成: {total_boards} 个概念板块"
                await session.commit()

        await publish_log(
            f"[sector_sync:done] 板块数据同步完成: {total_boards} 个概念板块", "INFO"
        )

    except Exception as e:
        logger.exception(f"Sector sync task {task_id} failed")
        await publish_log(f"[sector_sync:error] 同步失败: {e}", "ERROR")
        async with async_session() as session:
            task = await session.get(DataTask, task_id)
            if task:
                task.status = "failed"
                task.finished_at = datetime.now()
                task.message = str(e)
                await session.commit()
