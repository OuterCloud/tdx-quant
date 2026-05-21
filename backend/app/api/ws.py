import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from redis.asyncio import Redis

from app.core.logging import LOG_CHANNEL
from app.core.redis import get_redis

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()

    try:
        redis: Redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(LOG_CHANNEL)
    except Exception as e:
        logger.warning(f"WebSocket: Redis connection failed: {e}")
        await websocket.close(code=1011, reason="Redis unavailable")
        return

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                await websocket.send_text(data)
            else:
                await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket connection closed: {e}")
    finally:
        try:
            await pubsub.unsubscribe(LOG_CHANNEL)
            await pubsub.aclose()
            await redis.aclose()
        except Exception:
            pass
