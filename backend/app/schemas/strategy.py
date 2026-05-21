from datetime import datetime

from pydantic import BaseModel, Field


class StrategyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    description: str = ""


class StrategyUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=50)
    description: str | None = None
    config: dict | None = None


class StrategyResponse(BaseModel):
    id: int
    name: str
    description: str
    config: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime
