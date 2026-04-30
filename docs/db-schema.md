# DB Schema — 자장(Jajang)

**버전**: v1.3.1
**작성일**: 2026-04-24 / 최종 갱신: 2026-04-30
**DB**: PostgreSQL 15+

> v1.3.1 (2026-04-30): PRD v1.3.1 반영. voice_samples → recordings 재정의, generated_tracks → master_audios 재정의, recording_sessions 신설. 기존 voice_samples / generated_tracks DDL 폐기. 알림 마이그레이션 메모 추가.

---

## 1. ERD

```mermaid
erDiagram
    users ||--o{ recording_sessions : "has"
    users ||--|| generation_counters : "has"
    users ||--o{ rewarded_ad_usage : "has"
    users ||--o| subscriptions : "has"

    recording_sessions ||--o{ recordings : "has N clips"
    recording_sessions ||--o| master_audios : "has 1 output"

    users {
        uuid id PK
        text email UK "nullable (소셜만 가입 시)"
        text password_hash "nullable (소셜 로그인 시)"
        text provider "email | apple | google"
        text provider_uid "소셜 provider 고유 ID"
        boolean privacy_consent_given
        timestamptz privacy_consent_at
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "soft delete"
    }

    recording_sessions {
        uuid id PK
        uuid user_id FK
        text session_id UK "클라이언트 생성 UUID (멱등성)"
        text song_key "brahms | mozart | schubert | twinkle | rockabye | hush"
        text status "open | generating | completed | failed"
        timestamptz created_at
        timestamptz updated_at
    }

    recordings {
        uuid id PK
        uuid session_id FK
        text s3_key "S3 클립 경로 (recordings/ prefix)"
        float duration_seconds
        float rms_db
        int peak_count
        float snr_db "서버 librosa 검증 후"
        text status "uploaded | validated | deleted"
        timestamptz schedule_delete_at "master_audio 완료 후 24h"
        timestamptz deleted_at
        timestamptz created_at
    }

    master_audios {
        uuid id PK
        uuid session_id FK UK
        text s3_key "결과 mp3 경로 (masters/ prefix)"
        text status "pending | processing | completed | failed"
        text error_message
        int dsp_duration_ms "DSP 처리 소요 시간"
        int clip_count "concat 시 클립 수 (N)"
        timestamptz created_at
        timestamptz completed_at
    }

    generation_counters {
        uuid user_id PK FK
        int count "누적 생성 횟수 (master_audio 완료 기준)"
        timestamptz last_generated_at
        timestamptz updated_at
    }

    rewarded_ad_usage {
        uuid id PK
        uuid user_id FK
        int year_month "YYYYMM 형식"
        int monthly_count "당월 누적 시청 횟수"
        timestamptz today_unlock_expires_at "KST 자정"
        timestamptz created_at
        timestamptz updated_at
    }

    subscriptions {
        uuid id PK
        uuid user_id FK UK
        text revenuecat_customer_id UK
        text entitlement "free | trial | premium"
        text product_id "monthly | annual"
        timestamptz trial_starts_at
        timestamptz trial_expires_at
        timestamptz current_period_ends_at
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    audit_logs {
        uuid id PK
        text user_id "FK 없음 — 탈퇴 후에도 보존"
        text action
        jsonb metadata
        timestamptz created_at
    }
```

---

## 2. DDL

### users

```sql
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 TEXT,
    password_hash         TEXT,
    provider              TEXT NOT NULL CHECK (provider IN ('email', 'apple', 'google')),
    provider_uid          TEXT,
    privacy_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    privacy_consent_at    TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at            TIMESTAMPTZ,

    CONSTRAINT uq_email UNIQUE (email),
    CONSTRAINT uq_provider_uid UNIQUE (provider, provider_uid),
    CONSTRAINT chk_email_or_social CHECK (
        (provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL)
        OR (provider IN ('apple', 'google') AND provider_uid IS NOT NULL)
    )
);

CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_provider ON users (provider, provider_uid) WHERE deleted_at IS NULL;
```

### recording_sessions

```sql
-- migration 0006
CREATE TABLE recording_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL UNIQUE,   -- 클라이언트 생성 UUID, 멱등성 키
    song_key    TEXT NOT NULL
                    CHECK (song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')),
    status      TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'generating', 'completed', 'failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recording_sessions_user ON recording_sessions (user_id);
CREATE INDEX idx_recording_sessions_status ON recording_sessions (user_id, status, created_at DESC)
    WHERE status = 'completed';
```

### recordings

```sql
-- migration 0006 (recording_sessions와 동일 마이그레이션)
CREATE TABLE recordings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    s3_key              TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'uploaded'
                            CHECK (status IN ('uploaded', 'validated', 'deleted')),
    duration_seconds    REAL,
    rms_db              REAL,
    peak_count          INTEGER,
    snr_db              REAL,
    schedule_delete_at  TIMESTAMPTZ,   -- master_audio 완료 후 now() + 24h 세팅
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recordings_session ON recordings (session_id);
CREATE INDEX idx_recordings_delete_schedule
    ON recordings (schedule_delete_at)
    WHERE deleted_at IS NULL AND schedule_delete_at IS NOT NULL;
```

### master_audios

```sql
-- migration 0006
CREATE TABLE master_audios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL UNIQUE REFERENCES recording_sessions(id) ON DELETE CASCADE,
    s3_key          TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message   TEXT,
    dsp_duration_ms INTEGER,
    clip_count      INTEGER,        -- DSP 처리 시 concat 클립 수
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_master_audios_session ON master_audios (session_id);
-- S06 홈 "생성 완료 카드" 쿼리용
CREATE INDEX idx_master_audios_completed ON master_audios (session_id, completed_at DESC)
    WHERE status = 'completed';
```

### generation_counters

```sql
CREATE TABLE generation_counters (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    count               INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
    last_generated_at   TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 신규 유저 생성 시 자동 삽입 (트리거 또는 API 레이어)
```

### rewarded_ad_usage

```sql
CREATE TABLE rewarded_ad_usage (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month                INTEGER NOT NULL,   -- YYYYMM
    monthly_count             INTEGER NOT NULL DEFAULT 0 CHECK (monthly_count >= 0),
    today_unlock_expires_at   TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_month UNIQUE (user_id, year_month)
);
```

### subscriptions

```sql
CREATE TABLE subscriptions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    revenuecat_customer_id   TEXT NOT NULL UNIQUE,
    entitlement              TEXT NOT NULL DEFAULT 'free'
                                 CHECK (entitlement IN ('free', 'trial', 'premium')),
    product_id               TEXT CHECK (product_id IN ('monthly', 'annual')),
    trial_starts_at          TIMESTAMPTZ,
    trial_expires_at         TIMESTAMPTZ,
    current_period_ends_at   TIMESTAMPTZ,
    is_active                BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### audit_logs

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT,           -- FK 없음: 탈퇴 후 hard delete 시에도 감사 기록 보존
    action      TEXT NOT NULL,  -- 'account_deletion_requested' | 'account_hard_deleted'
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);
```

---

## 3. Alembic 마이그레이션 메모

| migration | 내용 | 상태 |
|---|---|---|
| 0001 | users, generation_counters, subscriptions | 기존 |
| 0002 | voice_samples (구 스키마) | **폐기 — 0006에서 대체** |
| 0003 | generated_tracks (구 스키마) | **폐기 — 0006에서 대체** |
| 0004 | rewarded_ad_usage | 기존 |
| 0005 | audit_logs | 기존 |
| 0006 | recording_sessions, recordings, master_audios (신규) | 신규 작성 필요 |

**마이그레이션 0006 주의사항**:
- 0002(voice_samples), 0003(generated_tracks) 테이블은 삭제 마이그레이션 필요.
- MVP 초기 단계라 기존 데이터 없음 → `DROP TABLE IF EXISTS voice_samples, generated_tracks` + 신규 테이블 생성.
- ORM 모델: `VoiceSample`, `GeneratedTrack` → `RecordingSession`, `Recording`, `MasterAudio`로 교체.

```python
# apps/api/alembic/versions/0006_recording_model_refactor.py
# 요약: voice_samples + generated_tracks 폐기 + recording_sessions / recordings / master_audios 신설
```

---

## 4. 주요 쿼리

### 4-1. 생성 횟수 체크 + 증가 (트랜잭션 내)

```sql
-- Step 1: 세션 생성 전 체크 (SELECT FOR UPDATE)
BEGIN;
SELECT count FROM generation_counters
WHERE user_id = $1
FOR UPDATE;

-- count < 3 이면 세션 생성 허용:
INSERT INTO recording_sessions (user_id, session_id, song_key) VALUES ($1, $2, $3);

COMMIT;

-- master_audio 완료 후 별도 트랜잭션:
UPDATE generation_counters
SET count = count + 1,
    last_generated_at = NOW(),
    updated_at = NOW()
WHERE user_id = $1;
```

### 4-2. 세션 멱등성 확인

```sql
-- 동일 session_id로 재시도 시 기존 상태 반환
SELECT rs.id, rs.status, ma.s3_key, ma.status AS audio_status
FROM recording_sessions rs
LEFT JOIN master_audios ma ON ma.session_id = rs.id
WHERE rs.session_id = $1;
-- audio_status = 'completed' → s3_key로 presigned URL 재발급
-- audio_status = 'processing' → 진행 중 응답
-- audio_status = 'failed' → 재생성 허용 (카운터 미차감)
```

### 4-3. S06 홈 "생성 완료 카드" 조회

```sql
SELECT rs.song_key, ma.s3_key, ma.completed_at
FROM recording_sessions rs
JOIN master_audios ma ON ma.session_id = rs.id
WHERE rs.user_id = $1
  AND ma.status = 'completed'
  AND ma.completed_at > $2  -- 마지막 확인 시각
ORDER BY ma.completed_at DESC
LIMIT 1;
```

### 4-4. 24h 클립 삭제 스케줄러 쿼리 (Celery Beat, 1h 주기)

```sql
SELECT id, s3_key
FROM recordings
WHERE deleted_at IS NULL
  AND schedule_delete_at <= NOW();
-- 이후: S3 DELETE + UPDATE recordings SET deleted_at = NOW()
```

### 4-5. DSP 처리를 위한 세션 클립 조회

```sql
SELECT id, s3_key, duration_seconds
FROM recordings
WHERE session_id = $1
  AND status = 'validated'
  AND deleted_at IS NULL
ORDER BY created_at ASC;
```

### 4-6. Rewarded Ad 월 7회 체크

```sql
INSERT INTO rewarded_ad_usage (user_id, year_month, monthly_count)
VALUES ($1, $2, 0)
ON CONFLICT (user_id, year_month) DO NOTHING;

SELECT monthly_count, today_unlock_expires_at
FROM rewarded_ad_usage
WHERE user_id = $1 AND year_month = $2;

-- 시청 완료 시 (monthly_count < 7):
UPDATE rewarded_ad_usage
SET monthly_count = monthly_count + 1,
    today_unlock_expires_at = DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 day' - INTERVAL '1 second',
    updated_at = NOW()
WHERE user_id = $1 AND year_month = $2;
```

### 4-7. 구독 상태 조회 (앱 진입 시)

```sql
SELECT entitlement, trial_expires_at, current_period_ends_at, is_active
FROM subscriptions
WHERE user_id = $1;
```

---

## 5. 데이터 보관 정책

| 데이터 | 보관 기간 | 삭제 방법 |
|---|---|---|
| 녹음 클립 (S3 `recordings/`) | master_audio 완료 후 24h | Celery Beat 1h 주기 + S3 lifecycle 백업 (2일) |
| master mp3 (S3 `masters/`) | 유저 삭제 요청 또는 계정 탈퇴까지 | 유저 요청 시 즉시 삭제 |
| 계정 데이터 (DB) | 탈퇴 즉시 soft delete | 30일 후 hard delete (GDPR) |
| 구독 로그 (subscriptions) | 탈퇴 후에도 7년 보관 | 세금/환불 분쟁 대비 |
| 감사 로그 (audit_logs) | 영구 보존 | FK 없음 — hard delete 영향 없음 |

---

## 6. 설계 결정 근거

### recording_sessions / recordings / master_audios 3-테이블 구조 선택

**기각한 대안**: voice_samples + generated_tracks (1:1 대응) — PRD v1.2.x의 "1 샘플 → 1 생성" 구조.

**채택 이유**:
1. PRD v1.3.0 "N개 클립 → 1 master output" 구조를 직접 반영. N=1 단순 loop, N≥2 셔플 concat.
2. `recording_sessions`가 멱등성 키(`session_id`) + 카운터 차감 단위 역할 통합.
3. `recordings`는 클립 단위 S3 경로 + 24h 삭제 스케줄 관리. `master_audios`는 DSP 결과 단위.
4. 클립 추가(다시 녹음)는 `recordings` 행 추가 — 세션과 카운터 변화 없음. ORM으로 표현 명확.

### generation_counters 별도 테이블 유지 (기존 결정 유지)

`users` 컬럼 대안 기각 이유:
- `users` 행 lock contention 없이 카운터만 SELECT FOR UPDATE 가능.
- 무료→Premium 전환 시 카운터 리셋 로직 격리.

### rewarded_ad_usage `year_month` INTEGER 설계 (기존 유지)

- 월 변경 체크: 단순 정수 비교.
- UNIQUE (user_id, year_month) constraint로 월별 레코드 중복 방지.
