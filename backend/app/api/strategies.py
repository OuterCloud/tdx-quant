import json

from fastapi import APIRouter, HTTPException
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.strategy import StrategyConfig
from app.schemas.strategy import StrategyCreate, StrategyResponse, StrategyUpdate
from app.services.screener import PRESET_STRATEGIES

router = APIRouter(prefix="/strategies", tags=["strategies"])

_CONFIG_KEY = "screening:config:v2"

PRESET_NAMES = set(PRESET_STRATEGIES.keys())


def _to_response(row: StrategyConfig) -> StrategyResponse:
    config = json.loads(row.config)
    return StrategyResponse(
        id=row.id,
        name=row.name,
        description=config.pop("description", ""),
        config=config,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.post("", response_model=StrategyResponse, status_code=201)
async def create_strategy(body: StrategyCreate):
    """Save current Redis config as a named strategy."""
    if body.name in PRESET_NAMES:
        raise HTTPException(status_code=409, detail="名称与内置预设重复")

    # Read current config from Redis
    redis: Redis = get_redis()
    try:
        data = await redis.get(_CONFIG_KEY)
    finally:
        await redis.aclose()

    if data:
        config = json.loads(data)
    else:
        config = {}

    # Remove active_preset from saved config
    config.pop("active_preset", None)
    config["description"] = body.description

    async with async_session() as session:
        # Check name uniqueness
        existing = await session.scalar(
            select(StrategyConfig).where(StrategyConfig.name == body.name)
        )
        if existing:
            raise HTTPException(status_code=409, detail="策略名称已存在")

        row = StrategyConfig(name=body.name, config=json.dumps(config, ensure_ascii=False))
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_response(row)


@router.get("", response_model=list[StrategyResponse])
async def list_strategies():
    """List all custom strategies."""
    async with async_session() as session:
        result = await session.execute(
            select(StrategyConfig).order_by(StrategyConfig.created_at.desc())
        )
        rows = result.scalars().all()
        return [_to_response(r) for r in rows]


@router.get("/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(strategy_id: int):
    async with async_session() as session:
        row = await session.get(StrategyConfig, strategy_id)
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")
        return _to_response(row)


@router.put("/{strategy_id}", response_model=StrategyResponse)
async def update_strategy(strategy_id: int, body: StrategyUpdate):
    async with async_session() as session:
        row = await session.get(StrategyConfig, strategy_id)
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")

        config = json.loads(row.config)

        if body.name is not None:
            if body.name in PRESET_NAMES:
                raise HTTPException(status_code=409, detail="名称与内置预设重复")
            # Check uniqueness
            existing = await session.scalar(
                select(StrategyConfig).where(
                    StrategyConfig.name == body.name, StrategyConfig.id != strategy_id
                )
            )
            if existing:
                raise HTTPException(status_code=409, detail="策略名称已存在")
            row.name = body.name

        if body.description is not None:
            config["description"] = body.description

        if body.config is not None:
            # Merge new config, preserve description
            desc = config.get("description", "")
            config = body.config
            config.pop("active_preset", None)
            config["description"] = desc

        row.config = json.dumps(config, ensure_ascii=False)
        await session.commit()
        await session.refresh(row)
        return _to_response(row)


@router.delete("/{strategy_id}")
async def delete_strategy(strategy_id: int):
    async with async_session() as session:
        row = await session.get(StrategyConfig, strategy_id)
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")
        await session.delete(row)
        await session.commit()
        return {"detail": "已删除"}


@router.post("/{strategy_id}/apply", response_model=dict)
async def apply_strategy(strategy_id: int):
    """Load strategy config into Redis as the active screening config."""
    async with async_session() as session:
        row = await session.get(StrategyConfig, strategy_id)
        if not row:
            raise HTTPException(status_code=404, detail="策略不存在")

    config = json.loads(row.config)
    config.pop("description", None)
    config["active_preset"] = f"custom:{strategy_id}"

    redis: Redis = get_redis()
    try:
        await redis.set(_CONFIG_KEY, json.dumps(config, ensure_ascii=False))
    finally:
        await redis.aclose()

    return {"detail": "已应用", "config": config}
