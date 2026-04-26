"""rewarded_ad_usage table

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rewarded_ad_usage",
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
        sa.Column("year_month", sa.Integer(), nullable=False),  # YYYYMM
        sa.Column("monthly_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("today_unlock_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("monthly_count >= 0", name="chk_rewarded_monthly_count"),
    )
    # 유저 + 월 복합 유니크 (한 유저가 같은 달에 레코드 1개만)
    op.create_index(
        "uq_rewarded_ad_usage_user_month",
        "rewarded_ad_usage",
        ["user_id", "year_month"],
        unique=True,
    )
    op.create_index("idx_rewarded_ad_usage_user", "rewarded_ad_usage", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_rewarded_ad_usage_user", table_name="rewarded_ad_usage")
    op.drop_index("uq_rewarded_ad_usage_user_month", table_name="rewarded_ad_usage")
    op.drop_table("rewarded_ad_usage")
