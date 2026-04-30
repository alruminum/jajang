"""006 DSP recording model — recording_sessions / recordings / master_audios
   + DROP voice_samples / generated_tracks

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-30
"""

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── 구 테이블 DROP (CASCADE: 연관 레코드 전부 제거) ──────────────────
    op.drop_table("generated_tracks")
    op.drop_table("voice_samples")

    # ── 신규 테이블 ────────────────────────────────────────────────────
    op.create_table(
        "recording_sessions",
        sa.Column("id",               UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",          UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("song_key",         sa.Text(), nullable=False),
        sa.Column("status",           sa.Text(), nullable=False, server_default="open"),
        sa.Column("idempotency_key",  UUID(as_uuid=True), nullable=False),
        sa.Column("created_at",       sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_check_constraint(
        "chk_session_song_key", "recording_sessions",
        "song_key IN ('brahms','mozart','schubert','twinkle','rockabye','hush')",
    )
    op.create_check_constraint(
        "chk_session_status", "recording_sessions",
        "status IN ('open','generating','completed','failed')",
    )
    op.create_unique_constraint(
        "uq_session_idempotency_key", "recording_sessions", ["idempotency_key"]
    )
    op.create_index("idx_recording_sessions_user", "recording_sessions", ["user_id"])
    op.create_index(
        "idx_recording_sessions_user_status", "recording_sessions", ["user_id", "status"],
        postgresql_where=sa.text("status IN ('generating','completed')"),
    )

    op.create_table(
        "recordings",
        sa.Column("id",                 UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id",         UUID(as_uuid=True),
                  sa.ForeignKey("recording_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("s3_key",             sa.Text(), nullable=True),
        sa.Column("duration_ms",        sa.Integer(), nullable=True),
        sa.Column("is_validated",       sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at",         sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.Column("schedule_delete_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_recordings_session", "recordings", ["session_id"])
    op.create_index(
        "idx_recordings_delete_schedule", "recordings", ["schedule_delete_at"],
        postgresql_where=sa.text("schedule_delete_at IS NOT NULL"),
    )

    op.create_table(
        "master_audios",
        sa.Column("id",              UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id",      UUID(as_uuid=True),
                  sa.ForeignKey("recording_sessions.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("s3_key",          sa.Text(), nullable=True),
        sa.Column("status",          sa.Text(), nullable=False, server_default="pending"),
        sa.Column("dsp_duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message",   sa.Text(), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.Column("completed_at",    sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "chk_master_status", "master_audios",
        "status IN ('pending','processing','completed','failed')",
    )
    op.create_unique_constraint(
        "uq_master_session_id", "master_audios", ["session_id"]
    )
    op.create_index("idx_master_audios_session", "master_audios", ["session_id"])
    op.create_index(
        "idx_master_audios_user_completed", "master_audios",
        ["session_id", "status", "completed_at"],
        postgresql_where=sa.text("status = 'completed'"),
    )


def downgrade():
    # master_audios → recordings → recording_sessions 순 DROP
    op.drop_index("idx_master_audios_user_completed", table_name="master_audios")
    op.drop_index("idx_master_audios_session", table_name="master_audios")
    op.drop_table("master_audios")

    op.drop_index("idx_recordings_delete_schedule", table_name="recordings")
    op.drop_index("idx_recordings_session", table_name="recordings")
    op.drop_table("recordings")

    op.drop_index("idx_recording_sessions_user_status", table_name="recording_sessions")
    op.drop_index("idx_recording_sessions_user", table_name="recording_sessions")
    op.drop_table("recording_sessions")

    # 구 테이블 재생성 (최소 DDL — 하위 호환)
    op.create_table(
        "voice_samples",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("s3_key", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="uploaded"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_table(
        "generated_tracks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
