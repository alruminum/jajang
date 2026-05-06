# Epic 03 — DSP 음원 후처리 생성 (v1.3.1) — System Design

> **Status**: Active (architect SYSTEM_DESIGN 산출, run-12063dd1)
> **PRD**: prd.md §F4 + §F14 (server-side custom trial)
> **Stories**: stories.md Story 1~7
> **UX Flow**: ux-flow.md (S06/S12/S14/S17 + §3a)

## 1. 데이터 모델

### 1.1 신설 테이블 (Alembic 0006)

| 테이블 | 컬럼 | 제약 |
|---|---|---|
| `recording_sessions` | `id UUID PK`, `user_id UUID FK→users.id`, `song_key VARCHAR(64) NOT NULL`, `status ENUM('recording','processing','completed','failed') NOT NULL DEFAULT 'recording'`, `idempotency_key VARCHAR(64) NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `completed_at TIMESTAMPTZ` | `UNIQUE(user_id, idempotency_key)`, INDEX `(user_id, status, created_at DESC)` |
| `recordings` | `id UUID PK`, `session_id UUID FK→recording_sessions.id ON DELETE CASCADE`, `seq INT NOT NULL`, `s3_key VARCHAR(255)`, `duration_ms INT NOT NULL`, `schedule_delete_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `UNIQUE(session_id, seq)`, INDEX `(schedule_delete_at) WHERE s3_key IS NOT NULL` |
| `master_audios` | `id UUID PK`, `session_id UUID FK→recording_sessions.id`, `user_id UUID FK→users.id`, `song_key VARCHAR(64) NOT NULL`, `s3_key VARCHAR(255)`, `status ENUM('processing','completed','failed') NOT NULL`, `error_code VARCHAR(64)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `completed_at TIMESTAMPTZ` | INDEX `(user_id, status, completed_at DESC)` |

Invariants:
- `recording_sessions.status` 전이: `recording → processing → (completed | failed)` (역방향 금지)
- `recordings.seq` 1-based, 세션 내 연속 (gap 금지)
- `master_audios.s3_key` 는 `status='completed'` 시에만 NOT NULL
- `recordings.schedule_delete_at` 는 DSP 종료 (success/fail) 시 set, S3 삭제 후 `s3_key=NULL`

### 1.2 폐기 테이블 (Alembic 0006 DROP)

- `voice_samples` (Alembic 0002 신설) → DROP
- `generated_tracks` (Alembic 0003 신설) → DROP
- ORM `VoiceSample`, `GeneratedTrack` 폐기 (코드 import 제거)
- 관련 라우터 (`/voices/*`, `/generations/*`) → 410 Gone (§2.3 참조)

### 1.3 재사용 (변경 X)

- `subscriptions.trial_expires_at TIMESTAMPTZ` (Epic 01 산출, `apps/api/app/models/subscription.py:37` 검증, 추가 마이그레이션 X)
- `generation_counters` (Epic 01 산출, 카운터 로직 재사용 — §5)
- `users` (변경 X)

## 2. API 시그니처

### 2.1 Sessions API (신규, prefix `/api/v1`)

| Method + Path | Body | 성공 응답 | 에러 |
|---|---|---|---|
| `POST /sessions/init` | `{song_key, idempotency_key}` | 201 `{session_id, presigned_url}` | 402 `GENERATION_LIMIT_EXCEEDED` (무료 + count≥3), 409 `IDEMPOTENCY_CONFLICT` |
| `POST /sessions/{id}/recordings` | `{seq, duration_ms}` | 201 `{recording_id, presigned_url}` | 404 / 409 `SESSION_NOT_RECORDING` |
| `POST /sessions/{id}/generate` | (empty) | 202 `{status: 'processing'}` (Celery dispatch) | 409 `SESSION_INVALID_STATE`, 422 `NO_RECORDINGS` |
| `GET /sessions/{id}/status` | — | 200 `{status, presigned_url?, error_code?}` | 404 |
| `GET /masters/me?limit=20&cursor=...` | — | 200 `{items: [{master_id, song_key, presigned_url, completed_at}], next_cursor}` | — |

폴링: 클라이언트는 `GET /sessions/{id}/status` 5s 간격 (S12 Generating 화면). DSP soft_time_limit=35s 이므로 평균 5~7회 폴링.

### 2.2 인증/엔티타이틀먼트 응답 (Trial 인지 — 경로 A 채택)

`POST /auth/login` / `POST /auth/refresh` / `POST /auth/google` 응답 body 에 다음 포함:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "trial_expires_at": "2026-05-13T00:00:00Z",
  "is_active_subscription": false
}
```

- `trial_expires_at`: nullable. Trial 미진입 또는 만료 시 `null`.
- `is_active_subscription`: RevenueCat entitlement 활성 여부.
- 클라이언트는 매 토큰 갱신 시 자동 갱신 — 별도 `GET /me` 호출 없음.
- **경로 B (`GET /me`) 미채택** — 단순성 + 토큰 갱신 시점 자동 동기화 + 별도 endpoint round-trip 제거.

### 2.3 구 라우터 410 Gone

다음 엔드포인트 → `410 Gone {detail: 'DEPRECATED_IN_V1.3.1'}` (구 클라이언트 호환):
- `POST /voices/init`, `POST /voices/{id}/upload`, `GET /voices/me`
- `POST /generations/init`, `GET /generations/{id}/status`, `GET /tracks/me`

## 3. DSP 파이프라인 시퀀스

Celery task `dsp_processing(session_id)`:

1. **다운로드**: `recordings.s3_key` 전체를 `/tmp/sess-{id}/clip-{seq}.m4a` 로 받음
2. **ffmpeg 단계** (각 클립별 직렬):
   - `afftdn=nr=20` (FFT denoise)
   - `equalizer=f=120:t=q:w=1:g=-6` (저주파 컷)
   - `aecho=0.6:0.3:60:0.3` (가벼운 잔향)
3. **N=1 분기**: 단일 클립 자체에 `acrossfade=d=2:c1=tri:c2=tri` 2회 적용 (시작-끝 fade) → 5분 길이 padding
4. **N≥2 분기**: Fisher-Yates 셔플 (직전 클립 제외) → 순차 `acrossfade` 체인 concat → 5분 길이까지 반복
5. **업로드**: 결과 `master.m4a` → `s3://jajang-audio/masters/{user_id}/{master_id}.m4a` → `master_audios.s3_key` 업데이트 + `status='completed'` + `completed_at=NOW()`

**Celery 설정**: `acks_late=True`, `soft_time_limit=35`, `time_limit=60`, `max_retries=3`, retry `countdown=[60, 180, 600]s`.

**실패 처리**: 3회 retry 후 최종 실패 시 `master_audios.status='failed'` + `error_code IN ('DSP_TIMEOUT', 'FFMPEG_ERROR', 'S3_UPLOAD_ERROR')`. 카운터 증가 X.

## 4. Trial 라이프사이클

| 시점 | 동작 |
|---|---|
| 가입 완료 (`POST /auth/google` 첫 성공) | `subscriptions.trial_expires_at = NOW() + INTERVAL '7 days'` |
| 활성 (`trial_expires_at > NOW()`) | `is_premium = true` (RevenueCat 무관) |
| D-1 (만료 24h 전) | Celery Beat task `trial_expiry_notify` — 푸시 + 인앱 배너 큐잉 |
| 만료 (`trial_expires_at <= NOW()`) AND RevenueCat 비활성 | 무료 다운그레이드. 카운터 *Trial 진입 전 값 유지* |
| Premium 결제 | RevenueCat webhook → `subscriptions.is_active = true` (trial_expires_at 무관) |

**Entitlement 우선순위**:
```
is_premium = is_active_subscription
          OR (trial_expires_at IS NOT NULL AND trial_expires_at > NOW())
```

서버는 `POST /sessions/init` 진입 시마다 위 식 평가. 클라이언트는 응답 body 의 두 필드로 동일 로직을 mirror (UI gating 용).

## 5. 카운터 enforcement

- `POST /sessions/init` 진입 시 `is_premium` 체크 → true 면 카운터 skip (무제한)
- 무료 유저: `SELECT ... FOR UPDATE` (row lock) → `count >= 3` 면 402 `GENERATION_LIMIT_EXCEEDED`, 아니면 session 생성 (count 변경 X)
- **DSP 성공 시**: `generation_counters.count += 1` (별도 트랜잭션, Celery task 내부, race-safe)
- **DSP 실패 / 재시도**: 카운터 변경 X
- **Trial 기간 생성**: 카운터 변경 X (Premium 동등)
- **Trial 만료 후 다운그레이드**: Trial 중 생성분 *소급 가산 X*. Trial 진입 전 소진 횟수 그대로 유지

근거: PRD §F14 "Trial 기간엔 무제한 + 만료 후 Trial 진입 전 카운터 복원".

## 6. 클립 24h 자동 삭제

- DSP 종료 시 (success/fail 무관): `recordings.schedule_delete_at = NOW() + INTERVAL '24 hours'`
- **Celery Beat task `clip_cleanup`** — 1h 주기:
  - `SELECT ... WHERE schedule_delete_at <= NOW() AND s3_key IS NOT NULL`
  - S3 `DeleteObject` → `recordings.s3_key = NULL` (row 자체는 보존, audit trail)
- **S3 lifecycle rule** (`recordings/` prefix, 24h TTL) — Celery 실패 대비 백업 (이중 안전망)
- structlog `clip.deleted` 기록 (`recording_id`, `session_id`, `deleted_at`)

근거: PRD §F4 "원본 음성 24h 내 삭제 (개인정보 최소화)".

## 7. Pending session 복원 정책 (carry-over)

DSP 처리 중 앱 강제 종료 → 재실행 시:

- **클라이언트**: 마지막 active `session_id` 를 SecureStore 저장 (`POST /sessions/init` 성공 시) — **로컬 저장 채택**
  - 대안 (`GET /sessions/me?status=processing`) 미채택 — 동시 다중 세션 race 방지 + 단순성
- 앱 시작 시: 저장된 `session_id` 로 `GET /sessions/{id}/status` 1회 호출
  - `status=processing`: S06 홈 진입 + 백그라운드 폴링 시작 (S12 Generating 재진입 X — Background Generation Banner)
  - `status=completed`: S06 의 "생성 완료 음원 있음" 카드 자동 노출 + SecureStore session_id 클리어
  - `status=failed`: S06 토스트 "생성 실패 — 다시 시도하기" + 재시도 시 S12 진입 + SecureStore 클리어
  - `404`: SecureStore 클리어 (orphan)

## 8. Mock DSP 환경 (`MOCK_DSP=true`)

- `MockDspService` 클래스 — `dsp_processing` Celery task 내부 분기:
  - 3초 sleep 후 placeholder mp3 (`s3://jajang-audio/mock/mock_master.mp3`) 의 presigned_url 반환
  - `master_audios.status='completed'`
- **카운터 +1 X** (개발 환경 카운터 소진 방지) — Story 2 수용 기준 정합
- 환경변수 `MOCK_DSP=true` (apps/api/.env, M0 전 기본값) → false 시 실제 ffmpeg 파이프라인 실행

## 9. 의존성 + 후속 정합 작업

| 문서 | 변경 | 처리 시점 |
|---|---|---|
| `docs/db-schema.md` | `recording_sessions` / `recordings` / `master_audios` 신설 표 추가, `voice_samples` / `generated_tracks` DROP 표기 | TASK_DECOMPOSE 산출 impl/01 (Alembic 0006) 단계 |
| `docs/sdk.md §1` | 단일 인자 `getEntitlement(customerInfo)` 스니펫 잔존 → 2-인자 `getEntitlement(customerInfo, trial_expires_at)` 통일 | NICE TO HAVE — plan-reviewer cycle 2 후속 |
| `docs/architecture.md §2` | DSP 파이프라인 흐름 추가 (이미 일부 v1.3.1 반영) | impl/02 (DSP pipeline) 단계 |
| `docs/domain-logic.md §2` | 카운터 표 Trial 행 (이미 cycle 2 patch 완료) | 변경 없음 — 검증만 |

## 10. 후속 단계

- validator DESIGN_VALIDATION (다음 step) — 본 design vs PRD/UX Flow/stories 정합 검증
- architect TASK_DECOMPOSE — impl/04~07 (Story 4~7) 신규 작성 + 폐기 impl 7건 정리
- impl-loop 진입 (v1.3.1 신규 impl/01~07 7 task)

## 결론

SYSTEM_DESIGN_READY
