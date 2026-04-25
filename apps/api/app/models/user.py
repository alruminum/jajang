import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, Boolean, CheckConstraint, DateTime, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('email', 'apple', 'google')",
            name="chk_provider_values",
        ),
        CheckConstraint(
            "(provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL) "
            "OR (provider IN ('apple', 'google') AND provider_uid IS NOT NULL)",
            name="chk_email_or_social",
        ),
        UniqueConstraint("email", name="uq_email"),
        UniqueConstraint("provider", "provider_uid", name="uq_provider_uid"),
        Index("idx_users_email", "email", postgresql_where="deleted_at IS NULL"),
        Index(
            "idx_users_provider",
            "provider",
            "provider_uid",
            postgresql_where="deleted_at IS NULL",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)  # email | apple | google
    provider_uid: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    privacy_consent_given: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    privacy_consent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True)
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships (Epic 01 범위)
    generation_counter: Mapped[Optional["GenerationCounter"]] = relationship(  # noqa: F821
        back_populates="user", uselist=False
    )
    subscription: Mapped[Optional["Subscription"]] = relationship(  # noqa: F821
        back_populates="user", uselist=False
    )
