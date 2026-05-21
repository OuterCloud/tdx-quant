from pydantic import BaseModel


class SectorItem(BaseModel):
    id: int
    code: str
    name: str
    board_type: str
    stock_count: int


class SectorSyncStatus(BaseModel):
    concept_count: int
    synced_at: str | None
    is_syncing: bool
