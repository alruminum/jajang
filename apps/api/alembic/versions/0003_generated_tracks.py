"""generated_tracks table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generated_tracks",
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
        sa.Column(
            "voice_sample_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("voice_samples.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            unique=True,
        ),
        sa.Column("song_key", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("s3_key", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("gpu_duration_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')",
            name="chk_track_song_key",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="chk_track_status",
        ),
        sa.UniqueConstraint("job_id", name="uq_generated_track_job_id"),
    )

    op.create_index("idx_generated_tracks_user", "generated_tracks", ["user_id"])
    op.create_index("idx_generated_tracks_job", "generated_tracks", ["job_id"])
    op.create_index(
        "idx_generated_tracks_status",
        "generated_tracks",
        ["user_id", "status", "completed_at"],
        postgresql_where=sa.text("status = 'completed'"),
    )


def downgrade() -> None:
    op.drop_index("idx_generated_tracks_status", table_name="generated_tracks")
    op.drop_index("idx_generated_tracks_job", table_name="generated_tracks")
    op.drop_index("idx_generated_tracks_user", table_name="generated_tracks")
    op.drop_table("generated_tracks")
