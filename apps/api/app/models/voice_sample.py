import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Float, Index, Integer, Text
from sqlalchemy import UUID as SA_UUID
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class VoiceSample(Base):
    __tablename__ = "voice_samples"
    __table_args__ = (
        CheckConstraint(
            "status IN ('uploaded', 'validated', 'generation_started', 'deleted')",
            name="chk_voice_sample_status",
        ),
        Index("idx_voice_samples_user", "user_id"),
        Index(
            "idx_voice_samples_delete_schedule",
            "schedule_delete_at",
            postgresql_where="deleted_at IS NULL AND schedule_delete_at IS NOT NULL",
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
    s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="uploaded")
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rms_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    peak_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    snr_db: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    schedule_delete_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped["User"] = relationship(  # noqa: F821
        back_populates="voice_samples"
    )
