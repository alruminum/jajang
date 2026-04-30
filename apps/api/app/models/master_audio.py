import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base  # 프로젝트 컨벤션 — app.core.db 직접 임포트 X


class MasterAudio(Base):
    __tablename__ = "master_audios"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="chk_master_status",
        ),
        UniqueConstraint("session_id", name="uq_master_session_id"),
        Index("idx_master_audios_session", "session_id"),
        Index("idx_master_audios_user_completed", "session_id", "status", "completed_at",
              postgresql_where="status = 'completed'"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recording_sessions.id", ondelete="CASCADE"), nullable=False
    )
    s3_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    dsp_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    session: Mapped["RecordingSession"] = relationship(back_populates="master_audio")  # noqa: F821
