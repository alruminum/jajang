"""voice_samples table

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voice_samples",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="uploaded"),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("rms_db", sa.Float(), nullable=True),
        sa.Column("peak_count", sa.Integer(), nullable=True),
        sa.Column("snr_db", sa.Float(), nullable=True),
        sa.Column("schedule_delete_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('uploaded', 'validated', 'generation_started', 'deleted')",
            name="chk_voice_sample_status",
        ),
    )
    op.create_index("idx_voice_samples_user", "voice_samples", ["user_id"])
    op.create_index(
        "idx_voice_samples_delete_schedule",
        "voice_samples",
        ["schedule_delete_at"],
        postgresql_where=sa.text("deleted_at IS NULL AND schedule_delete_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_voice_samples_delete_schedule", table_name="voice_samples")
    op.drop_index("idx_voice_samples_user", table_name="voice_samples")
    op.drop_table("voice_samples")
