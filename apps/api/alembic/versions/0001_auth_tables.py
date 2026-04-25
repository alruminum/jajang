"""auth tables: users, generation_counters, subscriptions

Revision ID: 0001
Revises:
Create Date: 2026-04-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("provider", sa.Text(), nullable=False),
        sa.Column("provider_uid", sa.Text(), nullable=True),
        sa.Column(
            "privacy_consent_given",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("privacy_consent_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "provider IN ('email', 'apple', 'google')",
            name="chk_provider_values",
        ),
        sa.CheckConstraint(
            "(provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL) "
            "OR (provider IN ('apple', 'google') AND provider_uid IS NOT NULL)",
            name="chk_email_or_social",
        ),
        sa.UniqueConstraint("email", name="uq_email"),
        sa.UniqueConstraint("provider", "provider_uid", name="uq_provider_uid"),
    )
    op.create_index(
        "idx_users_email",
        "users",
        ["email"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_users_provider",
        "users",
        ["provider", "provider_uid"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # --- generation_counters ---
    op.create_table(
        "generation_counters",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("count >= 0", name="chk_count_positive"),
    )

    # --- subscriptions ---
    op.create_table(
        "subscriptions",
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
            unique=True,
            nullable=False,
        ),
        sa.Column("revenuecat_customer_id", sa.Text(), nullable=False, unique=True),
        sa.Column("entitlement", sa.Text(), nullable=False, server_default="free"),
        sa.Column("product_id", sa.Text(), nullable=True),
        sa.Column("trial_starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default="false"
        ),
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
        sa.CheckConstraint(
            "entitlement IN ('free', 'trial', 'premium')", name="chk_entitlement"
        ),
        sa.CheckConstraint(
            "product_id IS NULL OR product_id IN ('monthly', 'annual')",
            name="chk_product_id",
        ),
    )

    # --- 신규 유저 가입 시 generation_counter 자동 생성 트리거 ---
    op.execute(
        """
        CREATE OR REPLACE FUNCTION create_generation_counter()
        RETURNS TRIGGER AS $$
        BEGIN
            INSERT INTO generation_counters (user_id, count)
            VALUES (NEW.id, 0)
            ON CONFLICT (user_id) DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_create_generation_counter
        AFTER INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION create_generation_counter();
    """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_create_generation_counter ON users;")
    op.execute("DROP FUNCTION IF EXISTS create_generation_counter;")
    op.drop_table("subscriptions")
    op.drop_table("generation_counters")
    op.drop_index("idx_users_provider", table_name="users")
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
