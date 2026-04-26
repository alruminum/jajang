import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, CheckConstraint, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RewardedAdUsage(Base):
    """
    월별 Rewarded Ad 시청 횟수 + 당일 언락 만료.
    year_month: YYYYMM 정수 (예: 202604)
    """

    __tablename__ = "rewarded_ad_usage"
    __table_args__ = (
        CheckConstraint("monthly_count >= 0", name="chk_rewarded_monthly_count"),
        UniqueConstraint("user_id", "year_month", name="uq_rewarded_ad_usage_user_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    year_month: Mapped[int] = mapped_column(Integer, nullable=False)  # YYYYMM
    monthly_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    today_unlock_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="rewarded_ad_usages")  # noqa: F821
