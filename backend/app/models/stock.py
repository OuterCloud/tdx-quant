from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Stock(Base):
    __tablename__ = "stocks"

    code: Mapped[str] = mapped_column(String(10), primary_key=True)
    name: Mapped[str] = mapped_column(String(20))
    market: Mapped[int]  # 0=深圳, 1=上海
    industry: Mapped[str | None] = mapped_column(String(50), default=None)
    is_st: Mapped[bool] = mapped_column(Boolean, default=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
