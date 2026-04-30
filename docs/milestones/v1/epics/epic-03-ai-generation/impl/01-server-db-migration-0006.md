---
depth: std
---

# impl/01 — 서버: Alembic 0006 DB 마이그레이션 + DSP ORM 모델

**Epic**: 03 — DSP 음원 후처리 생성  
**커버 스토리**: Story 1 (DB 모델 마이그레이션 0006)  
**선행 조건**: Epic 02 완료 (Alembic 0001~0005 적용 완료)  
**예상 소요**: 3~4시간

> **[v1.3.1 피벗]** 구 impl/01(GeneratedTrack ORM + 003 migration)과 구 Epic 02 impl/02(VoiceSample ORM) 를 **대체**. 구 ORM 파일은 삭제하지 않고 import 참조만 제거 (downgrade 시 재활용 가능).

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── models/
│   ├── recording_session.py      [신규 — RecordingSession ORM]
│   ├── recording.py              [신규 — Recording ORM]
│   ├── master_audio.py           [신규 — MasterAudio ORM]
│   ├── user.py                   [수정 — voice_samples/generated_tracks relationship 제거 + recording_sessions relationship 추가]
│   └── __init__.py               [수정 — 신규 3개 모델 import 추가, VoiceSample/GeneratedTrack import 제거]
├── alembic/
│   └── versions/006_dsp_recording_model.py  [신규 — Alembic 0006]
└── schemas/
    └── sessions.py               [신규 — Pydantic v2 request/response 스키마]
```

> `voice_sample.py`, `generated_track.py` 파일 자체는 삭제하지 않음. `models/__init__.py` 및 `user.py`에서 참조만 제거.  
> **Schema-First**: DDL이 Single Source of Truth. `docs/db-schema.md` 해당 섹션 먼저 업데이트 후 ORM 작성.  
> **마이그레이션 경로**: migration 파일은 `apps/api/app/migrations/versions/`가 아닌 `apps/api/alembic/versions/`에 생성 (기존 0001~0005 파일 위치 일치).

---

## 2. DDL (Single Source of Truth — docs/db-schema.md 에도 동일 반영)

```sql
-- recording_sessions: 세션 단위 (카운터 차감 단위)
CREATE TABLE recording_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_key          TEXT NOT NULL CHECK (song_key IN ('brahms','mozart','schubert','twinkle','rockabye','hush')),
    status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','generating','completed','failed')),
    idempotency_key   UUID NOT NULL UNIQUE,  -- 클라이언트 생성 UUID (멱등성 키)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recording_sessions_user ON recording_sessions(user_id);
CREATE INDEX idx_recording_sessions_user_status ON recording_sessions(user_id, status)
    WHERE status IN ('generating','completed');

-- recordings: 녹음 클립 (N개, 24h 삭제 대상)
CREATE TABLE recordings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    s3_key              TEXT,               -- S3 업로드 완료 후 설정. 삭제 후 NULL.
    duration_ms         INTEGER,            -- 클립 길이 (ms)
    is_validated        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schedule_delete_at  TIMESTAMPTZ         -- DSP 완료 후 NOW() + 24h 설정
);

CREATE INDEX idx_recordings_session ON recordings(session_id);
CREATE INDEX idx_recordings_delete_schedule ON recordings(schedule_delete_at)
    WHERE schedule_delete_at IS NOT NULL;

-- master_audios: DSP 결과 mp3 (session당 1개)
CREATE TABLE master_audios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       UUID NOT NULL UNIQUE REFERENCES recording_sessions(id) ON DELETE CASCADE,
    s3_key           TEXT,                  -- completed 시 설정
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed')),
    dsp_duration_ms  INTEGER,               -- DSP 처리 소요 시간 (관측가능성)
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX idx_master_audios_session ON master_audios(session_id);
CREATE INDEX idx_master_audios_user_completed ON master_audios(session_id, status, completed_at)
    WHERE status = 'completed';
```

---

## 3. ORM 모델

### recording_session.py

```python
# apps/api/app/models/recording_session.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Index, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base  # app.core.db 직접 임포트 X — 프로젝트 컨벤션 (user.py 동일 패턴)


class RecordingSession(Base):
    __tablename__ = "recording_sessions"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id          = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    song_key         = Column(String, nullable=False)
    status           = Column(String, nullable=False, default="open")
    idempotency_key  = Column(UUID(as_uuid=True), nullable=False, unique=True)
    created_at       = Column(DateTime(timezone=True), nullable=False,
                              default=lambda: datetime.now(timezone.utc))

    user          = relationship("User", back_populates="recording_sessions")
    recordings    = relationship("Recording", back_populates="session", cascade="all, delete-orphan")
    master_audio  = relationship("MasterAudio", back_populates="session", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "song_key IN ('brahms','mozart','schubert','twinkle','rockabye','hush')",
            name="chk_session_song_key",
        ),
        CheckConstraint(
            "status IN ('open','generating','completed','failed')",
            name="chk_session_status",
        ),
        UniqueConstraint("idempotency_key", name="uq_session_idempotency_key"),
        Index("idx_recording_sessions_user", "user_id"),
        Index("idx_recording_sessions_user_status", "user_id", "status",
              postgresql_where="status IN ('generating','completed')"),
    )
```

### recording.py

```python
# apps/api/app/models/recording.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base  # 프로젝트 컨벤션 — app.core.db 직접 임포트 X


class Recording(Base):
    __tablename__ = "recordings"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id          = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id", ondelete="CASCADE"), nullable=False)
    s3_key              = Column(String, nullable=True)
    duration_ms         = Column(Integer, nullable=True)
    is_validated        = Column(Boolean, nullable=False, default=False)
    created_at          = Column(DateTime(timezone=True), nullable=False,
                                 default=lambda: datetime.now(timezone.utc))
    schedule_delete_at  = Column(DateTime(timezone=True), nullable=True)

    session = relationship("RecordingSession", back_populates="recordings")

    __table_args__ = (
        Index("idx_recordings_session", "session_id"),
        Index("idx_recordings_delete_schedule", "schedule_delete_at",
              postgresql_where="schedule_delete_at IS NOT NULL"),
    )
```

### master_audio.py

```python
# apps/api/app/models/master_audio.py
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Index, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base  # 프로젝트 컨벤션 — app.core.db 직접 임포트 X


class MasterAudio(Base):
    __tablename__ = "master_audios"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id       = Column(UUID(as_uuid=True), ForeignKey("recording_sessions.id", ondelete="CASCADE"),
                              nullable=False, unique=True)
    s3_key           = Column(String, nullable=True)
    status           = Column(String, nullable=False, default="pending")
    dsp_duration_ms  = Column(Integer, nullable=True)
    error_message    = Column(String, nullable=True)
    created_at       = Column(DateTime(timezone=True), nullable=False,
                              default=lambda: datetime.now(timezone.utc))
    completed_at     = Column(DateTime(timezone=True), nullable=True)

    session = relationship("RecordingSession", back_populates="master_audio")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="chk_master_status",
        ),
        UniqueConstraint("session_id", name="uq_master_session_id"),
        Index("idx_master_audios_session", "session_id"),
        Index("idx_master_audios_user_completed", "session_id", "status", "completed_at",
              postgresql_where="status = 'completed'"),
    )
```

---

## 4. Alembic 마이그레이션 006

```python
# apps/api/alembic/versions/006_dsp_recording_model.py
# 주의: 파일 위치는 apps/api/alembic/versions/ (기존 0001~0005 위치)
"""006 DSP recording model — recording_sessions / recordings / master_audios
   + DROP voice_samples / generated_tracks

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-30
"""
# revision/down_revision 값은 파일명이 아닌 0005 파일의 `revision = "0005"` 값과 일치해야 함.

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    # ── 구 테이블 DROP (CASCADE: 연관 레코드 전부 제거) ──────────────────
    # voice_samples, generated_tracks 는 이미 구현된 코드가 없으므로 DROP
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
        sa.Column("idempotency_key",  UUID(as_uuid=True), nullable=False, unique=True),
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
                  nullable=False, unique=True),
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
    op.create_index("idx_master_audios_session", "master_audios", ["session_id"])
    op.create_index(
        "idx_master_audios_user_completed", "master_audios",
        ["session_id", "status", "completed_at"],
        postgresql_where=sa.text("status = 'completed'"),
    )


def downgrade():
    # master_audios → recordings → recording_sessions 순 DROP
    op.drop_index("idx_master_audios_user_completed")
    op.drop_index("idx_master_audios_session")
    op.drop_table("master_audios")

    op.drop_index("idx_recordings_delete_schedule")
    op.drop_index("idx_recordings_session")
    op.drop_table("recordings")

    op.drop_index("idx_recording_sessions_user_status")
    op.drop_index("idx_recording_sessions_user")
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
```

---

## 5. models/__init__.py 수정 + user.py 수정

### models/__init__.py — 완전한 교체 내용

```python
# apps/api/app/models/__init__.py
# Before: VoiceSample, GeneratedTrack import 포함
# After:  RecordingSession, Recording, MasterAudio 추가 / VoiceSample, GeneratedTrack 제거

from app.models.audit_log import AuditLog                  # noqa: F401  (유지)
from app.models.base import Base                           # (유지)
from app.models.generation_counter import GenerationCounter  # noqa: F401  (유지)
from app.models.rewarded_ad_usage import RewardedAdUsage   # noqa: F401  (유지)
from app.models.subscription import Subscription           # noqa: F401  (유지)
from app.models.user import User                           # noqa: F401  (유지)

# 신규 추가
from app.models.recording_session import RecordingSession  # noqa: F401
from app.models.recording import Recording                 # noqa: F401
from app.models.master_audio import MasterAudio            # noqa: F401

# 제거 (import 라인 삭제, 파일 자체는 삭제 X)
# from app.models.voice_sample import VoiceSample
# from app.models.generated_track import GeneratedTrack

__all__ = [
    "AuditLog", "Base", "GenerationCounter", "MasterAudio",
    "Recording", "RecordingSession", "RewardedAdUsage",
    "Subscription", "User",
]
```

### user.py — relationship 교체

```python
# apps/api/app/models/user.py
# Epic 02 범위 voice_samples relationship 제거
# Epic 03 범위 generated_tracks relationship 제거 → recording_sessions으로 교체

# 제거:
#   voice_samples: Mapped[list["VoiceSample"]] = relationship(back_populates="user")
#   generated_tracks: Mapped[list["GeneratedTrack"]] = relationship(back_populates="user")

# 추가 (Epic 03 범위 주석 블록 교체):
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.recording_session import RecordingSession

# User 클래스 내부:
recording_sessions: Mapped[list["RecordingSession"]] = relationship(  # noqa: F821
    back_populates="user"
)
```

> `RecordingSession.user_id` FK가 `users.id`를 참조하므로 `back_populates="user"` 짝을 맞추기 위해
> §3 `recording_session.py`에 `user = relationship("User", back_populates="recording_sessions")` 이미 포함됨 (확인).

---

## 6. 결정 근거

### 구 테이블 DROP (보존 X)

`voice_samples`, `generated_tracks` 테이블을 실제 운영 데이터가 없는 MVP 단계에서 DROP. 마이그레이션 downgrade에서 최소 DDL로 재생성. 구 ORM 파일은 삭제하지 않음 — 참조만 제거.

### idempotency_key 클라이언트 생성

멱등성 키를 클라이언트가 생성해 전달. 서버가 생성하면 재시도 시 동일 키 확인 불가. 구 `job_id` 설계 동일 패턴.

### session당 master_audio 1개 (UNIQUE session_id)

DSP는 세션 전체 클립을 concat해 single master.mp3 생성. 재생성 요청 = 기존 master_audio status 체크 후 재실행 (새 레코드 생성 X).

---

## 7. 수용 기준

- [ ] (TEST) `alembic upgrade head` — 0006 오류 없음
- [ ] (TEST) `alembic downgrade -1` — 롤백 정상 (recording_sessions/recordings/master_audios 삭제 + 구 테이블 재생성)
- [ ] (TEST) `recording_sessions` idempotency_key 중복 INSERT → UNIQUE 위반 오류
- [ ] (TEST) `master_audios.status = 'unknown'` INSERT → CHECK constraint 위반
- [ ] (TEST) `Recording.session` 역참조 정상 동작 (`session.recordings` 조회 가능)
- [ ] (TEST) `MasterAudio.session` 역참조 정상 동작
- [ ] (TEST) `user.recording_sessions` 역참조 정상 동작 (User → RecordingSession 조회 가능)
- [ ] (TEST) `voice_samples`, `generated_tracks` 테이블 존재하지 않음 (`\dt` 확인)
- [ ] (MANUAL) `from app.models import VoiceSample` 시 `ImportError` 발생 확인 (제거 확인)

---

## 8. 주의사항

- 0006 실행 전 `voice_samples`, `generated_tracks`에 실제 데이터가 있으면 CASCADE DROP으로 소실. MVP 개발 환경에서 데이터 없다고 가정. 프로덕션 데이터 존재 시 별도 마이그레이션 전략 필요.
- **user.py 수정 필수**: `voice_samples`, `generated_tracks` relationship 제거 + `recording_sessions` relationship 추가. 제거하지 않으면 `VoiceSample`/`GeneratedTrack` import 제거 후 앱 기동 시 `NameError` 발생.
- **RecordingSession.user relationship 필수**: `back_populates="user"` 짝 없으면 SQLAlchemy 기동 시 `InvalidRequestError`. §3 코드블록에 이미 포함됨 — 구현 시 누락 주의.
- 구 테이블 참조 코드(services, tasks, API 라우터)가 남아있으면 `NameError`. 이번 impl은 DB 레이어만. 구 참조 코드 제거는 impl/02~03에서 진행.
