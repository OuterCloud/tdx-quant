import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class DataTask(Base):
    __tablename__ = "data_tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    task_type: Mapped[str] = mapped_column(String(20))  # "init" or "update"
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/running/done/failed
    progress: Mapped[int] = mapped_column(default=0)
    total: Mapped[int] = mapped_column(default=0)
    message: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
