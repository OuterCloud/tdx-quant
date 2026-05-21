from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis

router = APIRouter()


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    checks = {"postgres": False, "redis": False}

    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception:
        pass

    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = True
        await redis.aclose()
    except Exception:
        pass

    status = "healthy" if all(checks.values()) else "degraded"
    return {"status": status, "checks": checks}
