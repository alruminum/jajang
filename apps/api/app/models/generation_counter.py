import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, CheckConstraint, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class GenerationCounter(Base):
    """
    Note: TimestampMixin 미사용. migration 0001에서 updated_at만 포함되어 있으므로
    created_at을 추가하면 ORM-DB 불일치 → autogenerate drift 발생.
    updated_at 컬럼만 직접 선언.
    """

    __tablename__ = "generation_counters"
    __table_args__ = (
        CheckConstraint("count >= 0", name="chk_count_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="generation_counter")  # noqa: F821
