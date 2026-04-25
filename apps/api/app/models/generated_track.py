import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, Text, UniqueConstraint
from sqlalchemy import UUID as SA_UUID
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.voice_sample import VoiceSample


class GeneratedTrack(Base):
    """AI 음원 생성 job 레코드.

    job_id: 클라이언트가 생성·전달하는 UUID (멱등성 키).
    동일 job_id로 재시도 시 기존 레코드 상태를 반환 — 카운터 이중 차감 방지.

    상태 전이: pending → processing → completed | failed
    """

    __tablename__ = "generated_tracks"
    __table_args__ = (
        CheckConstraint(
            "song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')",
            name="chk_track_song_key",
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="chk_track_status",
        ),
        UniqueConstraint("job_id", name="uq_generated_track_job_id"),
        Index("idx_generated_tracks_user", "user_id"),
        Index("idx_generated_tracks_job", "job_id"),
        # S06 홈 "생성 완료 카드" 쿼리 최적화 (db-schema.md §2 DDL 기준)
        Index(
            "idx_generated_tracks_status",
            "user_id",
            "status",
            "completed_at",
            postgresql_where="status = 'completed'",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        SA_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    voice_sample_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        SA_UUID(as_uuid=True),
        ForeignKey("voice_samples.id", ondelete="SET NULL"),
        nullable=True,
    )
    # 클라이언트 생성 UUID — 멱등성 키
    job_id: Mapped[uuid.UUID] = mapped_column(
        SA_UUID(as_uuid=True), nullable=False, unique=True
    )
    song_key: Mapped[str] = mapped_column(Text, nullable=False)
    # pending | processing | completed | failed
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    # completed 시 세팅
    s3_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # failed 시 사유
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 추론 소요 시간 (관측가능성)
    gpu_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="generated_tracks")
    voice_sample: Mapped[Optional["VoiceSample"]] = relationship(
        back_populates="generated_tracks"
    )
