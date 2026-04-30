import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base  # app.core.db 직접 임포트 X — 프로젝트 컨벤션 (user.py 동일 패턴)


class RecordingSession(Base):
    __tablename__ = "recording_sessions"
    __table_args__ = (
        CheckConstraint(
            "song_key IN ('brahms','mozart','schubert','twinkle','rockabye','hush')",
            name="chk_session_song_key",
        ),
        CheckConstraint(
            "status IN ('open','generating','completed','failed')",
            name="chk_session_status",
        ),
        UniqueConstraint("idempotency_key", name="uq_session_idempotency_key"),
        Index("idx_recording_sessions_user", "user_id"),
        Index("idx_recording_sessions_user_status", "user_id", "status",
              postgresql_where="status IN ('generating','completed')"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    song_key: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="open")
    idempotency_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="recording_sessions")  # noqa: F821
    recordings: Mapped[list["Recording"]] = relationship(  # noqa: F821
        back_populates="session", cascade="all, delete-orphan"
    )
    master_audio: Mapped[Optional["MasterAudio"]] = relationship(  # noqa: F821
        back_populates="session", uselist=False
    )
