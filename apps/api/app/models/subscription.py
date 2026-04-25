import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, Boolean, CheckConstraint, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            "entitlement IN ('free', 'trial', 'premium')",
            name="chk_entitlement",
        ),
        CheckConstraint(
            "product_id IS NULL OR product_id IN ('monthly', 'annual')",
            name="chk_product_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    revenuecat_customer_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    entitlement: Mapped[str] = mapped_column(Text, nullable=False, default="free")
    product_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trial_starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    trial_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_period_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship(back_populates="subscription")  # noqa: F821
