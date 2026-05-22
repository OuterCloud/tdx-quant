import asyncio
import json

from fastapi import APIRouter, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.data_task import DataTask
from app.models.sector import Sector, StockSector
from app.models.stock import Stock
from app.schemas.sector import SectorItem, SectorMembersResponse, SectorMemberItem, SectorSyncStatus

router = APIRouter(prefix="/sectors", tags=["sectors"])

# Module-level flag to track if a sync is running
_sync_running = False


@router.get("", response_model=list[SectorItem])
async def get_sectors():
    """Return all sectors (from Redis cache first, fallback to DB)."""
    redis: Redis = get_redis()
    try:
        cached = await redis.get("sectors:list")
        if cached:
            items = json.loads(cached)
            return [SectorItem(**item) for item in items]
    finally:
        await redis.aclose()

    # Fallback to DB
    async with async_session() as session:
        result = await session.execute(
            select(Sector).order_by(Sector.stock_count.desc())
        )
        sectors = list(result.scalars().all())
    return [
        SectorItem(
            id=s.id,
            code=s.code,
            name=s.name,
            board_type=s.board_type,
            stock_count=s.stock_count,
        )
        for s in sectors
    ]


@router.get("/search", response_model=list[SectorItem])
async def search_sectors(q: str = Query(..., min_length=1)):
    """Search sectors by name."""
    async with async_session() as session:
        result = await session.execute(
            select(Sector).where(Sector.name.contains(q)).order_by(Sector.stock_count.desc()).limit(50)
        )
        sectors = list(result.scalars().all())
    return [
        SectorItem(
            id=s.id,
            code=s.code,
            name=s.name,
            board_type=s.board_type,
            stock_count=s.stock_count,
        )
        for s in sectors
    ]


@router.get("/{sector_id}/members", response_model=SectorMembersResponse)
async def get_sector_members(
    sector_id: int,
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    sort_by: str = Query("amount", pattern="^(pct_change|amount|volume_ratio)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    ma_aligned_only: bool = Query(False),
):
    """Return paginated members of a sector with indicator data from Redis."""
    async with async_session() as session:
        # Get sector info
        sector = await session.get(Sector, sector_id)
        if not sector:
            raise HTTPException(status_code=404, detail="Sector not found")

        sector_item = SectorItem(
            id=sector.id, code=sector.code, name=sector.name,
            board_type=sector.board_type, stock_count=sector.stock_count,
        )

        # Get member stock codes with names
        stmt = (
            select(StockSector.stock_code, Stock.name)
            .join(Stock, Stock.code == StockSector.stock_code)
            .where(StockSector.sector_id == sector_id)
        )
        result = await session.execute(stmt)
        members = list(result.all())  # list of (stock_code, stock_name)

    # Batch read indicators from Redis
    redis: Redis = get_redis()
    try:
        codes = [m[0] for m in members]
        if codes:
            keys = [f"indicator:{code}" for code in codes]
            raw_values = await redis.mget(keys)
            indicator_map = {}
            for code, raw in zip(codes, raw_values):
                if raw:
                    indicator_map[code] = json.loads(raw)
        else:
            indicator_map = {}
    finally:
        await redis.aclose()

    # Build items with indicators
    all_items: list[SectorMemberItem] = []
    for stock_code, stock_name in members:
        ind = indicator_map.get(stock_code)
        if ind:
            item = SectorMemberItem(
                stock_code=stock_code,
                stock_name=stock_name,
                close=ind.get("close"),
                pct_change=ind.get("pct_change"),
                amount=ind.get("amount"),
                volume_ratio=ind.get("volume_ratio"),
                ma_aligned=ind.get("ma_aligned", False),
            )
        else:
            item = SectorMemberItem(stock_code=stock_code, stock_name=stock_name)
        all_items.append(item)

    # Filter
    if ma_aligned_only:
        all_items = [item for item in all_items if item.ma_aligned]

    total = len(all_items)

    # Sort
    reverse = sort_order == "desc"
    all_items.sort(
        key=lambda item: getattr(item, sort_by) or 0,
        reverse=reverse,
    )

    # Paginate
    start = (page - 1) * size
    end = start + size
    page_items = all_items[start:end]

    return SectorMembersResponse(sector=sector_item, total=total, items=page_items)


@router.post("/sync")
async def trigger_sync():
    """Trigger a background sector data sync."""
    global _sync_running
    if _sync_running:
        raise HTTPException(status_code=409, detail="Sector sync is already running")

    from app.services.sector_sync import run_sector_sync

    # Create a task record
    async with async_session() as session:
        task = DataTask(task_type="sector_sync", status="running")
        session.add(task)
        await session.commit()
        await session.refresh(task)
        task_id = task.id

    _sync_running = True

    async def _run():
        global _sync_running
        try:
            await run_sector_sync(task_id)
        finally:
            _sync_running = False

    asyncio.create_task(_run())
    return {"task_id": task_id, "message": "Sector sync started"}


@router.get("/sync-status", response_model=SectorSyncStatus)
async def get_sync_status():
    """Return current sync status."""
    redis: Redis = get_redis()
    try:
        synced_at = await redis.get("sectors:synced_at")
        cached = await redis.get("sectors:list")
        concept_count = 0
        if cached:
            concept_count = len(json.loads(cached))
    finally:
        await redis.aclose()

    return SectorSyncStatus(
        concept_count=concept_count,
        synced_at=synced_at.decode() if synced_at else None,
        is_syncing=_sync_running,
    )
