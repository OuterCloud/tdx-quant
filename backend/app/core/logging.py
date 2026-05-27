import sys

import redis as sync_redis
from loguru import logger
from redis.asyncio import Redis

from app.core.config import settings
from app.core.redis import get_redis

LOG_CHANNEL = "tdx:logs"


def setup_logging():
    """Configure loguru with console output."""
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
        level="DEBUG" if settings.DEBUG else "INFO",
    )


async def publish_log(message: str, level: str = "INFO"):
    """Publish a log message to Redis for WebSocket consumers."""
    redis: Redis = get_redis()
    try:
        await redis.publish(LOG_CHANNEL, f"[{level}] {message}")
    finally:
        await redis.aclose()


def publish_log_sync(message: str, level: str = "INFO"):
    """Synchronous version for use in threads (e.g. backtest engine)."""
    try:
        r = sync_redis.from_url(settings.REDIS_URL)
        r.publish(LOG_CHANNEL, f"[{level}] {message}")
        r.close()
    except Exception:
        pass
