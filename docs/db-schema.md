# DB Schema — 자장(Jajang)

**버전**: v1.0  
**작성일**: 2026-04-24  
**DB**: PostgreSQL 15+

---

## 1. ERD

```mermaid
erDiagram
    users ||--o{ voice_samples : "has"
    users ||--o{ generated_tracks : "has"
    users ||--|| generation_counters : "has"
    users ||--o{ rewarded_ad_usage : "has"
    users ||--o| subscriptions : "has"

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

    voice_samples {
        uuid id PK
        uuid user_id FK
        text s3_key "S3 경로"
        text status "uploaded | validated | generation_started | deleted"
        float duration_seconds
        float rms_db
        int peak_count
        float snr_db "서버 검증 후"
        timestamptz schedule_delete_at "생성 완료 후 24h"
        timestamptz deleted_at
        timestamptz created_at
    }

    generated_tracks {
        uuid id PK
        uuid user_id FK
        uuid voice_sample_id FK "nullable (샘플 삭제 후에도 트랙 유지)"
        text job_id UK "클라이언트 생성 UUID (멱등성)"
        text song_key "brahms | mozart | schubert | twinkle | rockabye | hush"
        text status "pending | processing | completed | failed"
        text s3_key "결과 mp3 경로"
        text error_message
        int gpu_duration_ms "추론 소요 시간"
        timestamptz created_at
        timestamptz completed_at
    }

    generation_counters {
        uuid user_id PK FK
        int count "누적 생성 횟수 (성공 기준)"
        timestamptz last_generated_at
        timestamptz updated_at
    }

    rewarded_ad_usage {
        uuid id PK
        uuid user_id FK
        int year_month "YYYYMM 형식 (월별 파티셔닝 대용)"
        int monthly_count "당월 누적 시청 횟수"
        timestamptz today_unlock_expires_at "자정 timestamp"
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
        text action "account_deletion_requested | account_hard_deleted"
        jsonb metadata "provider, email 등"
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

### voice_samples

```sql
CREATE TABLE voice_samples (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    s3_key              TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'uploaded'
                            CHECK (status IN ('uploaded', 'validated', 'generation_started', 'deleted')),
    duration_seconds    REAL,
    rms_db              REAL,
    peak_count          INTEGER,
    snr_db              REAL,
    schedule_delete_at  TIMESTAMPTZ,   -- 생성 완료 후 now() + 24h 세팅
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_samples_user ON voice_samples (user_id);
-- 24h 삭제 스케줄러용: 삭제 대상 조회
CREATE INDEX idx_voice_samples_delete_schedule
    ON voice_samples (schedule_delete_at)
    WHERE deleted_at IS NULL AND schedule_delete_at IS NOT NULL;
```

### generated_tracks

```sql
CREATE TABLE generated_tracks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voice_sample_id  UUID REFERENCES voice_samples(id) ON DELETE SET NULL,
    job_id           UUID NOT NULL UNIQUE,    -- 클라이언트 생성, 멱등성 키
    song_key         TEXT NOT NULL
                         CHECK (song_key IN ('brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush')),
    status           TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    s3_key           TEXT,
    error_message    TEXT,
    gpu_duration_ms  INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX idx_generated_tracks_user ON generated_tracks (user_id);
CREATE INDEX idx_generated_tracks_job ON generated_tracks (job_id);
-- S06 홈 "생성 완료 카드" 쿼리용
CREATE INDEX idx_generated_tracks_status ON generated_tracks (user_id, status, completed_at DESC)
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
    today_unlock_expires_at   TIMESTAMPTZ,        -- 자정 (23:59:59 KST)
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

### audit_logs (migration 0005)

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT,           -- FK 없음: 탈퇴 후 hard delete 시에도 감사 기록 보존
    action      TEXT NOT NULL,  -- 'account_deletion_requested' | 'account_hard_deleted'
    metadata    JSONB,          -- {"provider": "apple", "email": "...", ...}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);
```

**설계 결정**: `audit_logs.user_id` 에 FK 없음. 탈퇴 30일 후 `users` 행 hard delete 시 FK constraint 위반 방지. 감사 로그는 법적 증거 목적으로 영구 보존.

---

## 3. 주요 쿼리

### 3-1. 생성 횟수 체크 + 증가 (트랜잭션 내)

```sql
-- Step 1: 업로드 전 체크 (SELECT FOR UPDATE)
BEGIN;
SELECT count FROM generation_counters
WHERE user_id = $1
FOR UPDATE;

-- count < 3 이면 업로드 허용 후 GPU 추론 성공 시:
-- Step 2: 카운터 증가
UPDATE generation_counters
SET count = count + 1,
    last_generated_at = NOW(),
    updated_at = NOW()
WHERE user_id = $1;
COMMIT;
```

### 3-2. 재시도 멱등성 확인

```sql
-- 동일 job_id로 재시도 시 기존 상태 반환
SELECT id, status, s3_key
FROM generated_tracks
WHERE job_id = $1;
-- status = 'completed' → s3_key로 presigned URL 재발급
-- status = 'processing' → 진행 중 응답
-- status = 'failed' → 재생성 허용 (카운터 미차감)
```

### 3-3. S06 홈 "생성 완료 카드" 조회

```sql
-- 백그라운드 생성 완료 후 재진입 시
SELECT id, song_key, s3_key, completed_at
FROM generated_tracks
WHERE user_id = $1
  AND status = 'completed'
  AND completed_at > $2  -- 마지막 확인 시각
ORDER BY completed_at DESC
LIMIT 1;
```

### 3-4. 24h 샘플 삭제 스케줄러 쿼리 (Celery Beat, 1h 주기)

```sql
SELECT id, s3_key
FROM voice_samples
WHERE deleted_at IS NULL
  AND schedule_delete_at <= NOW();
-- 이후: S3 DELETE + UPDATE voice_samples SET deleted_at = NOW()
```

### 3-5. Rewarded Ad 월 7회 체크

```sql
-- UPSERT 방식으로 당월 레코드 확인/생성
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

### 3-6. 구독 상태 조회 (앱 진입 시)

```sql
SELECT entitlement, trial_expires_at, current_period_ends_at, is_active
FROM subscriptions
WHERE user_id = $1;
-- entitlement 열이 클라이언트 Zustand AuthSlice 동기화 기준
```

---

## 4. 데이터 보관 정책

| 데이터 | 보관 기간 | 삭제 방법 |
|---|---|---|
| 목소리 샘플 (S3) | 생성 완료 후 24h | Celery Beat 1h 주기 + S3 lifecycle 백업 (삭제 실패 시 2일 후 자동 만료) |
| 생성된 mp3 (S3) | 유저 삭제 요청 또는 계정 탈퇴까지 | 유저 요청 시 즉시 삭제 |
| 계정 데이터 (DB) | 탈퇴 시 즉시 soft delete | 30일 후 하드 delete (GDPR 보관 기간) |
| 구독 로그 (subscriptions) | 탈퇴 후에도 7년 보관 | 세금/환불 분쟁 대비 |

---

## 5. 설계 결정 근거

### generation_counters 별도 테이블 선택 이유

`users` 테이블 내 컬럼(`free_generation_count`)으로 관리하는 대안 검토:
- **기각 이유 1**: `users` 행 전체에 `FOR UPDATE` lock이 발생하면, 인증 쿼리(`SELECT users WHERE id = ?`)와 lock contention 발생 가능. 트래픽이 몰릴 때 인증 지연으로 이어짐.
- **기각 이유 2**: 향후 생성 이력(날짜별 카운트, 어떤 곡을 몇 번 생성했는지) 분석 필요 시 별도 테이블이 확장 용이.
- **채택 이유**: 카운터 테이블 분리 시 lock 범위 최소화, 인증 경로와 완전 분리.

### rewarded_ad_usage `year_month` INTEGER 설계

`DATE` 타입 대신 `INTEGER YYYYMM`을 선택:
- 월 변경 체크를 단순 정수 비교로 처리 (`EXTRACT(YEAR FROM NOW()) * 100 + EXTRACT(MONTH FROM NOW())`)
- 인덱스 효율 (timestamp 비교보다 정수 비교가 빠름)
- UNIQUE (user_id, year_month) constraint로 월별 레코드 중복 방지
