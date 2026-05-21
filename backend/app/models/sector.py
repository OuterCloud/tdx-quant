from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Sector(Base):
    __tablename__ = "sectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(50), index=True)
    board_type: Mapped[str] = mapped_column(String(10), default="concept")
    stock_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class StockSector(Base):
    __tablename__ = "stock_sectors"

    stock_code: Mapped[str] = mapped_column(
        String(10), ForeignKey("stocks.code", ondelete="CASCADE"), primary_key=True
    )
    sector_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sectors.id", ondelete="CASCADE"), primary_key=True
    )
    board_rank: Mapped[int | None] = mapped_column(Integer, default=None)
