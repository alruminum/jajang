import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Index, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.core.db import Base


class AuditLog(Base):
    """감사 로그 — 계정 탈퇴 이벤트 등 법적 보존 목적 레코드.

    설계 결정: user_id에 FK를 걸지 않는다.
    이유: 탈퇴 완료 후 users 행이 hard delete 되면 FK constraint 위반 발생.
    감사 로그는 탈퇴 이후에도 보존 필요 (법적 증거). user_id는 식별자 역할만 하는 텍스트.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_user", "user_id"),
        Index("idx_audit_logs_action", "action", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=True)   # FK 없음 (설계 결정 참조)
    action = Column(Text, nullable=False)   # 'account_deletion_requested' | 'account_hard_deleted'
    event_metadata = Column("metadata", JSON().with_variant(JSONB(), "postgresql"), nullable=True)  # SQLAlchemy reserved name 우회 + SQLite 호환
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
