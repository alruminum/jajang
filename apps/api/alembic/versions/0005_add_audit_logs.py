"""add audit_logs table

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-26
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.Text(), nullable=True),   # FK 없음 — 탈퇴 후 보존 목적
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("idx_audit_logs_user", "audit_logs", ["user_id"])
    op.create_index(
        "idx_audit_logs_action",
        "audit_logs",
        ["action", "created_at"],
        postgresql_ops={"created_at": "DESC"},
    )


def downgrade() -> None:
    op.drop_index("idx_audit_logs_action", table_name="audit_logs")
    op.drop_index("idx_audit_logs_user", table_name="audit_logs")
    op.drop_table("audit_logs")
