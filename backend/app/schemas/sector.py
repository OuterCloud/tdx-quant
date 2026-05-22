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


class SectorMemberItem(BaseModel):
    stock_code: str
    stock_name: str
    close: float | None = None
    pct_change: float | None = None
    amount: float | None = None
    volume_ratio: float | None = None
    ma_aligned: bool = False


class SectorMembersResponse(BaseModel):
    sector: SectorItem
    total: int
    items: list[SectorMemberItem]
