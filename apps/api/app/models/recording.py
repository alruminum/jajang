import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base  # 프로젝트 컨벤션 — app.core.db 직접 임포트 X


class Recording(Base):
    __tablename__ = "recordings"
    __table_args__ = (
        Index("idx_recordings_session", "session_id"),
        Index("idx_recordings_delete_schedule", "schedule_delete_at",
              postgresql_where="schedule_delete_at IS NOT NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recording_sessions.id", ondelete="CASCADE"), nullable=False
    )
    s3_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    schedule_delete_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    session: Mapped["RecordingSession"] = relationship(back_populates="recordings")  # noqa: F821
