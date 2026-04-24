---
depth: std
---

# impl/01 — DB 스키마 (인증 관련) + Alembic 초기 마이그레이션

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 2 (이메일 가입), Story 3 (소셜 가입), Story 4 (로그인), Story 5 (트라이얼)  
**선행 조건**: impl/00 완료 (FastAPI 골격, Alembic env.py)  
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/
├── app/
│   └── models/
│       ├── __init__.py          [수정 — 모델 exports 추가]
│       ├── base.py              [신규 — DeclarativeBase + TimestampMixin]
│       ├── user.py              [신규 — User ORM 모델]
│       ├── generation_counter.py [신규 — GenerationCounter ORM 모델]
│       └── subscription.py      [신규 — Subscription ORM 모델]
├── alembic/
│   └── versions/
│       └── 0001_auth_tables.py  [신규 — 초기 마이그레이션]
```

**주의**: Epic 01 범위의 테이블만 포함. `voice_samples`, `generated_tracks`, `rewarded_ad_usage`는 Epic 02/03/05 impl에서 추가 마이그레이션.

---

## 2. ORM 모델 인터페이스

### base.py

```python
from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False
    )
```

### user.py

```python
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import UUID, Text, Boolean, DateTime, CheckConstraint, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "(provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL) "
            "OR (provider IN ('apple', 'google') AND provider_uid IS NOT NULL)",
            name="chk_email_or_social",
        ),
        UniqueConstraint("email", name="uq_email"),
        UniqueConstraint("provider", "provider_uid", name="uq_provider_uid"),
        Index("idx_users_email", "email", postgresql_where="deleted_at IS NULL"),
        Index("idx_users_provider", "provider", "provider_uid",
              postgresql_where="deleted_at IS NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)   # email | apple | google
    provider_uid: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    privacy_consent_given: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    privacy_consent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships (Epic 01 범위)
    generation_counter: Mapped[Optional["GenerationCounter"]] = relationship(
        back_populates="user", uselist=False
    )
    subscription: Mapped[Optional["Subscription"]] = relationship(
        back_populates="user", uselist=False
    )
```

**CheckConstraint 설계 결정**: DB 레벨에서 이메일/소셜 분기 강제. 애플리케이션 레이어 버그가 DB까지 도달하는 것을 차단.

### generation_counter.py

```python
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import UUID, Integer, DateTime, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

class GenerationCounter(Base, TimestampMixin):
    __tablename__ = "generation_counters"
    __table_args__ = (
        CheckConstraint("count >= 0", name="chk_count_positive"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="generation_counter")
```

**Primary Key = user_id**: 1:1 관계 강제. `SELECT FOR UPDATE` 범위를 counter 행만으로 제한 (users 행 lock 없음). 상세 근거: `docs/db-schema.md §5`.

### subscription.py

```python
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import UUID, Text, Boolean, DateTime, CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (
        CheckConstraint(
            "entitlement IN ('free', 'trial', 'premium')",
            name="chk_entitlement"
        ),
        CheckConstraint(
            "product_id IS NULL OR product_id IN ('monthly', 'annual')",
            name="chk_product_id"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    revenuecat_customer_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    entitlement: Mapped[str] = mapped_column(Text, nullable=False, default="free")
    product_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trial_starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    trial_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_period_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship(back_populates="subscription")
```

---

## 3. Alembic 마이그레이션 파일

### alembic/versions/0001_auth_tables.py

```python
"""auth tables: users, generation_counters, subscriptions

Revision ID: 0001
Revises: 
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.Text(), nullable=True),
        sa.Column('password_hash', sa.Text(), nullable=True),
        sa.Column('provider', sa.Text(), nullable=False),
        sa.Column('provider_uid', sa.Text(), nullable=True),
        sa.Column('privacy_consent_given', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('privacy_consent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),

        sa.CheckConstraint(
            "provider IN ('email', 'apple', 'google')",
            name='chk_provider_values'
        ),
        sa.CheckConstraint(
            "(provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL) "
            "OR (provider IN ('apple', 'google') AND provider_uid IS NOT NULL)",
            name='chk_email_or_social'
        ),
        sa.UniqueConstraint('email', name='uq_email'),
        sa.UniqueConstraint('provider', 'provider_uid', name='uq_provider_uid'),
    )
    op.create_index('idx_users_email', 'users', ['email'],
                    postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_index('idx_users_provider', 'users', ['provider', 'provider_uid'],
                    postgresql_where=sa.text('deleted_at IS NULL'))

    # --- generation_counters ---
    op.create_table(
        'generation_counters',
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_generated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.CheckConstraint('count >= 0', name='chk_count_positive'),
    )

    # --- subscriptions ---
    op.create_table(
        'subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False),
        sa.Column('revenuecat_customer_id', sa.Text(), nullable=False, unique=True),
        sa.Column('entitlement', sa.Text(), nullable=False, server_default='free'),
        sa.Column('product_id', sa.Text(), nullable=True),
        sa.Column('trial_starts_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trial_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_period_ends_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),

        sa.CheckConstraint("entitlement IN ('free', 'trial', 'premium')", name='chk_entitlement'),
        sa.CheckConstraint(
            "product_id IS NULL OR product_id IN ('monthly', 'annual')",
            name='chk_product_id'
        ),
    )

    # --- 신규 유저 가입 시 generation_counter 자동 생성 트리거 ---
    op.execute("""
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
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_create_generation_counter ON users;")
    op.execute("DROP FUNCTION IF EXISTS create_generation_counter;")
    op.drop_table('subscriptions')
    op.drop_table('generation_counters')
    op.drop_index('idx_users_provider', table_name='users')
    op.drop_index('idx_users_email', table_name='users')
    op.drop_table('users')
```

**트리거 결정 근거**: 신규 유저 INSERT 시 `generation_counters` 행을 자동 생성. 애플리케이션 레이어에서 별도 INSERT 호출하는 대안 대비 — 원자성 보장 + 레이어 누락 버그 제거. 단점: DB 로직 분산. 수용 이유: 단순 삽입이므로 유지보수 위험 낮음.

---

## 4. models/__init__.py (exports)

```python
from app.models.base import Base
from app.models.user import User
from app.models.generation_counter import GenerationCounter
from app.models.subscription import Subscription

__all__ = ["Base", "User", "GenerationCounter", "Subscription"]
```

Alembic `env.py`에서 `import app.models` 시 모든 모델이 `Base.metadata`에 등록됨.

---

## 5. 핵심 로직: 마이그레이션 실행 절차

```bash
# 1. DB 준비 (로컬 Docker)
docker run -d --name jajang-pg \
  -e POSTGRES_USER=jajang \
  -e POSTGRES_PASSWORD=jajang \
  -e POSTGRES_DB=jajang \
  -p 5432:5432 postgres:15

# 2. 마이그레이션 실행
cd apps/api
uv run alembic upgrade head

# 3. 검증
uv run alembic current  # → 0001 (head)
```

---

## 6. 수용 기준

- [ ] `alembic upgrade head` 에러 없이 완료
- [ ] `alembic downgrade base` → 테이블 전체 삭제 에러 없음
- [ ] `alembic upgrade head` 재실행 멱등성 확인
- [ ] 신규 User INSERT 후 `generation_counters` 자동 행 생성 확인:
  ```sql
  INSERT INTO users (id, provider, email, password_hash, privacy_consent_given)
  VALUES (gen_random_uuid(), 'email', 'test@example.com', 'hash', true);
  SELECT * FROM generation_counters;  -- 해당 user_id 행 자동 생성
  ```
- [ ] CheckConstraint 검증: `provider='email'`이면서 `email=NULL`인 INSERT 시 에러 발생

---

## 7. 주의사항 (다른 모듈 경계)

- `voice_samples`, `generated_tracks` 테이블은 **Epic 02/03 impl**에서 추가 마이그레이션으로 추가. 이 impl에서 생성 금지.
- `rewarded_ad_usage` 테이블은 **Epic 05 impl**에서 추가.
- `app/models/__init__.py`에 모델 추가 시 Alembic autogenerate가 새 테이블을 자동 감지함. 의도치 않은 마이그레이션 생성 주의 — `alembic revision --autogenerate` 전에 반드시 추가 모델 존재 여부 확인.
- SQLAlchemy 2.x `Mapped[...]` 타입 힌트 방식 사용. 구 버전 `Column()` 방식 혼용 금지 — 타입 체커 오류 발생.
