from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class ScreeningResult(Base):
    __tablename__ = "screening_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    screen_date: Mapped[date] = mapped_column(Date, index=True)
    stock_code: Mapped[str] = mapped_column(String(10), index=True)
    stock_name: Mapped[str] = mapped_column(String(20))
    layer_passed: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    details: Mapped[str | None] = mapped_column(Text, default=None)  # JSON string
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
