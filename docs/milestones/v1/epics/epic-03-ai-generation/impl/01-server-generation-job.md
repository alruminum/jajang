---
depth: std
design: skipped
---

# impl/01 — 서버: generation_jobs 테이블 + GeneratedTrack ORM + Alembic 마이그레이션

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 2 (AI 생성 API 연동 — 서버 모델 기반), Story 4 (목소리 샘플 서버 자동 삭제 — schedule_delete_at 연계)  
**선행 조건**: Epic 01 완료 (users, generation_counters 테이블), Epic 02 완료 (voice_samples 테이블, 002 migration)  
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── models/
│   └── generated_track.py          [신규 — GeneratedTrack ORM]
├── migrations/
│   └── versions/003_generated_tracks.py  [신규 — Alembic 마이그레이션]
└── models/__init__.py               [수정 — GeneratedTrack import 추가]
```

> **스키마 출처**: `docs/db-schema.md §2 generated_tracks` DDL이 Single Source of Truth.
> ORM은 이 DDL의 파생물이며, 새 필드 추가 시 db-schema.md 먼저 수정 후 ORM/migration 갱신.

---

## 2. ORM 모델

```python
# apps/api/app/models/generated_track.py

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey, Index,
    CheckConstraint, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.db import Base


class GeneratedTrack(Base):
    __tablename__ = "generated_tracks"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id          = Column(
                         UUID(as_uuid=True),
                         ForeignKey("users.id", ondelete="CASCADE"),
                         nullable=False,
                       )
    voice_sample_id  = Column(
                         UUID(as_uuid=True),
                         ForeignKey("voice_samples.id", ondelete="SET NULL"),
                         nullable=True,
                       )
    job_id           = Column(UUID(as_uuid=True), nullable=False, unique=True)
    # job_id: 클라이언트가 생성·전달하는 UUID (멱등성 키).
    # 동일 job_id로 재시도 시 기존 레코드 상태를 반환 — 카운터 이중 차감 방지.

    song_key         = Column(String, nullable=False)
    status           = Column(String, nullable=False, default="pending")
    # 상태 전이: pending → processing → completed | failed
    # "pending": job 등록 완료, Celery task 아직 픽업 전
    # "processing": Celery worker가 GPU 추론 시작
    # "completed": mp3 S3 저장 완료
    # "failed": 추론 실패 또는 90초 타임아웃

    s3_key           = Column(String, nullable=True)           # completed 시 세팅
    error_message    = Column(String, nullable=True)           # failed 시 사유
    gpu_duration_ms  = Column(Integer, nullable=True)          # 추론 소요 시간 (관측가능성)
    created_at       = Column(
                         DateTime(timezone=True),
                         nullable=False,
                         default=lambda: datetime.now(timezone.utc),
                       )
    completed_at     = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user         = relationship("User", back_populates="generated_tracks")
    voice_sample = relationship("VoiceSample", back_populates="generated_tracks")

    __table_args__ = (
        CheckConstraint(
            "song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')",
            name="chk_track_song_key",
        ),
        CheckConstraint(
            "status IN ('pending', 'processing', 'completed', 'failed')",
            name="chk_track_status",
        ),
        UniqueConstraint("job_id", name="uq_generated_track_job_id"),
        Index("idx_generated_tracks_user", "user_id"),
        Index("idx_generated_tracks_job", "job_id"),
        # S06 홈 "생성 완료 카드" 쿼리 + has_pending 조회 최적화
        Index(
            "idx_generated_tracks_user_status_completed",
            "user_id", "status", "completed_at",
            postgresql_where="status = 'completed'",
        ),
        Index(
            "idx_generated_tracks_user_pending",
            "user_id", "status",
            postgresql_where="status IN ('pending', 'processing')",
        ),
    )
```

---

## 3. models/__init__.py 수정

```python
# apps/api/app/models/__init__.py
# 기존 import 유지, 아래 라인 추가

from app.models.generated_track import GeneratedTrack  # noqa: F401

# User 모델에 역참조 추가 필요 (apps/api/app/models/user.py):
# generated_tracks = relationship("GeneratedTrack", back_populates="user")
#
# VoiceSample 모델에 역참조 추가 필요 (apps/api/app/models/voice_sample.py):
# generated_tracks = relationship("GeneratedTrack", back_populates="voice_sample")
```

---

## 4. Alembic 마이그레이션

```python
# apps/api/app/migrations/versions/003_generated_tracks.py

"""003 generated_tracks table

Revision ID: 003_generated_tracks
Revises: 002_voice_samples
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


def upgrade():
    op.create_table(
        "generated_tracks",
        sa.Column("id",              UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id",         UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voice_sample_id", UUID(as_uuid=True),
                  sa.ForeignKey("voice_samples.id", ondelete="SET NULL"), nullable=True),
        sa.Column("job_id",          UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("song_key",        sa.Text(), nullable=False),
        sa.Column("status",          sa.Text(), nullable=False, server_default="pending"),
        sa.Column("s3_key",          sa.Text(), nullable=True),
        sa.Column("error_message",   sa.Text(), nullable=True),
        sa.Column("gpu_duration_ms", sa.Integer(), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.text("NOW()")),
        sa.Column("completed_at",    sa.DateTime(timezone=True), nullable=True),
    )

    op.create_check_constraint(
        "chk_track_song_key",
        "generated_tracks",
        "song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')",
    )
    op.create_check_constraint(
        "chk_track_status",
        "generated_tracks",
        "status IN ('pending', 'processing', 'completed', 'failed')",
    )

    op.create_index("idx_generated_tracks_user", "generated_tracks", ["user_id"])
    op.create_index("idx_generated_tracks_job",  "generated_tracks", ["job_id"])
    op.create_index(
        "idx_generated_tracks_user_status_completed",
        "generated_tracks",
        ["user_id", "status", "completed_at"],
        postgresql_where=sa.text("status = 'completed'"),
    )
    op.create_index(
        "idx_generated_tracks_user_pending",
        "generated_tracks",
        ["user_id", "status"],
        postgresql_where=sa.text("status IN ('pending', 'processing')"),
    )


def downgrade():
    op.drop_index("idx_generated_tracks_user_pending")
    op.drop_index("idx_generated_tracks_user_status_completed")
    op.drop_index("idx_generated_tracks_job")
    op.drop_index("idx_generated_tracks_user")
    op.drop_table("generated_tracks")
```

---

## 5. 상태 머신 요약

```
[클라이언트 POST /generations/init]
        │
        ▼
  GeneratedTrack 생성 (status='pending')
        │
        ▼
  Celery task 큐 등록
        │
        ▼
  Worker 픽업 → status='processing'
        │
        ├─ 추론 성공 → s3_key 저장 + status='completed' + completed_at = NOW()
        │              + voice_sample.schedule_delete_at = NOW() + 24h  (Story 4)
        │              + generation_counters.count += 1  (impl/02에서 커밋)
        │
        └─ 추론 실패 → error_message 저장 + status='failed'
                       + voice_sample.schedule_delete_at = NOW() + 24h  (Story 4)
                       + generation_counters 변경 없음 (실패는 차감 안 함)
```

**재시도 시 상태 전이:**
- 클라이언트가 동일 `job_id`로 POST /generations/init 재요청
- DB에 이미 해당 job_id 레코드 존재 → 현재 상태 그대로 반환 (새 레코드 생성 안 함)
- status='failed'인 경우에만 Celery 재큐 허용 (status='processing'은 재큐 금지 — 중복 실행 방지)

---

## 6. 결정 근거

### GeneratedTrack 별도 테이블 (users 컬럼 포함 대비)
- 생성 이력은 job 단위 독립 레코드 → 상태 전이 추적, gpu_duration_ms 관측가능성
- `job_id` UNIQUE constraint로 멱등성 보장이 ORM 레벨에서 가능
- `voice_sample_id` SET NULL → 샘플 삭제 후에도 트랙 레코드 유지 (Story 4)

### partial index (status = 'completed') 추가 이유
- S06 홈 진입 시 `WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 1` 쿼리가 빈번
- status가 completed인 레코드만 인덱싱 → 쓰기 부하 최소화 + 읽기 O(1) 유사

### pending/processing partial index
- has_pending 플래그 조회 (impl/05) 최적화
- 장기적으로 completed/failed가 누적되어도 인덱스 크기 증가 없음

---

## 7. 수용 기준

- [ ] `alembic upgrade head` — 003 migration 오류 없이 실행
- [ ] `alembic downgrade -1` — generated_tracks 테이블 롤백 정상
- [ ] GeneratedTrack 모델 import 시 SQLAlchemy relationship 에러 없음
- [ ] `job_id` UNIQUE constraint 확인: 동일 job_id 두 번 INSERT 시 IntegrityError
- [ ] `status` CHECK constraint 확인: 유효하지 않은 status 값 INSERT 시 거부
- [ ] `song_key` CHECK constraint 확인: 정의된 6개 외 값 거부
- [ ] User.generated_tracks, VoiceSample.generated_tracks 역참조 동작 확인

---

## 8. 주의사항

- `job_id`는 클라이언트가 UUID를 생성해 전달한다. 서버가 생성하면 클라이언트가 재시도 시 중복 인식 불가. 클라이언트 생성 UUID가 멱등성 키.
- Epic 02 impl/03 (quality_check_service)에서 `status='validated'`로 전환된 voice_sample만 generation 요청 가능하다. 이 impl은 그 검증을 하지 않는다 — impl/02 counter_enforcement에서 voice_sample status 체크.
- `voice_sample_id` SET NULL: S3 샘플이 삭제된 후에도 트랙 레코드와 mp3 S3 경로는 유지. 이는 의도된 설계 (Story 4 요건: 샘플 삭제가 트랙 접근을 막으면 안 됨).
