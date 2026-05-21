import asyncio
import json

from fastapi import APIRouter, HTTPException, Query
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.data_task import DataTask
from app.models.sector import Sector
from app.schemas.sector import SectorItem, SectorSyncStatus

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
