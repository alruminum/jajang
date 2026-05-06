# Epic 03 — Impl 실행 순서 및 의존성 (v1.3.1)

**Epic**: 03 — DSP 음원 후처리 생성  
**Impl 수**: 7개 (01~07, v1.3.1 신규)  
**갱신**: 2026-05-06 (TASK_DECOMPOSE run-12063dd1)

> **[v1.3.1 피벗]** 구 v1.2.x AI 합성 기반 impl 7건 (`01-server-generation-job` / `02-server-counter-enforcement` / `03-server-inference-client` / `04-server-generation-pipeline` / `05-server-tracks-list` / `06-app-generating-screen` / `07-app-track-list-home`) 은 **폐기**. 메인 commit 단계에서 `_DEPRECATED.md` 접미사 rename 또는 `deprecated/` 서브디렉토리 이동 권고. 신규 v1.3.1 impl 7건이 정식 진행 대상.

---

## 실행 순서

```
01-server-db-migration-0006   (Story 1, std)
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
02-server-dsp        06-server-counter   (서버 기반 — 병렬 가능)
-pipeline            -enforcement
(Story 2, deep)      (Story 6, std)
        │                    │
        └──────┬─────────────┘
               ▼
03-server-sessions-api   (Story 3, std — 06 의 entitlement deps 사용)
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
04-server-clip       05-server-masters    07-app-s12-pending
-cleanup             -list                (Story 7, std)
(Story 4, std)       (Story 5, std)       (impl/03 + 05 deps)
```

> **병렬 가능**: 01 완료 후 02 와 06 병렬 시작 가능 (entitlement_service 는 ORM 만 의존).
> 03 은 06 의 `require_auth_with_entitlement` deps 를 사용 — 06 의 entitlement 평가 함수 + counter_repo 가 먼저 PR merge 되어야 03 build green.

---

## Impl 요약표

| 파일 | depth | 커버 Story / Issue | 선행 impl | 예상 소요 |
|---|---|---|---|---|
| 01-server-db-migration-0006.md | std | Story 1 / #191 | Epic 01+02 완료 | 3~4h |
| 02-server-dsp-pipeline.md | **deep** | Story 2 / #192 | 01 | 6~8h |
| 03-server-sessions-api.md | std | Story 3 / #193 | 01, 02, 06 | 5~6h |
| 04-server-clip-cleanup.md | std | Story 4 / #194 | 01, 02 | 2~3h |
| 05-server-masters-list.md | std | Story 5 / #195 | 01, 03 | 3~4h |
| 06-server-counter-enforcement.md | std | Story 6 / #196 | 01 | 3~4h |
| 07-app-s12-pending.md | std | Story 7 / #197 | 03, 05 | 5~6h |

**총 예상 소요**: 27~35시간 (1인 주말 개발 기준 ~3주말)

---

## 병렬 실행 가능 구간

```
[Phase A — DB 기반]
  01-server-db-migration-0006

[Phase B — 서버 코어 (병렬 가능)]
  02-server-dsp-pipeline
  06-server-counter-enforcement      ← 02 와 동시 진행 가능

[Phase C — API 통합]
  03-server-sessions-api  (06 의 entitlement deps + 02 의 dsp_process_task 모두 import)

[Phase D — API 후속 (병렬 가능)]
  04-server-clip-cleanup            ← 02 의 schedule_delete_at 설정에 의존
  05-server-masters-list            ← 03 의 masters.py 라우터 리팩터

[Phase E — 클라이언트 통합]
  07-app-s12-pending                ← 03 의 sessions API + 05 의 mastersSlice
```

---

## 신규 파일 목록 (engineer 참조용)

### 서버 (`apps/api/`)

```
app/models/
├── recording_session.py             [01]
├── recording.py                     [01]
└── master_audio.py                  [01]

app/alembic/versions/
└── 006_dsp_recording_model.py       [01]

app/services/
├── dsp/__init__.py                  [02]
├── dsp/ffmpeg_service.py            [02]
├── dsp/mock_dsp_service.py          [02]
├── session_service.py               [03 + 06 리팩터]
├── masters_service.py               [05]
├── entitlement_service.py           [06]
└── counter_repo.py                  [06]

app/tasks/
├── dsp_processing.py                [02]
└── clip_cleanup.py                  [04 — 02 §6 의 task 이전]

app/api/v1/
├── sessions.py                      [03]
├── masters.py                       [03 + 05 리팩터]
└── generations.py                   [03 — 410 Gone 전환]

app/schemas/
└── sessions.py                      [03 + 05 next_cursor 추가]

app/api/
└── deps.py                          [06 — require_auth_with_entitlement 추가]

app/core/
├── celery_app.py                    [02 + 04 — include 추가]
├── celery_config.py                 [02 — beat_schedule 추가]
├── config.py                        [02 — MOCK_DSP 필드]
└── constants.py                     [06 — FREE_GENERATION_LIMIT]

infra/
└── s3-lifecycle-rule.json           [04 — operator 적용용]
```

### 앱 (`apps/mobile/`)

```
src/screens/
├── GeneratingScreen.tsx             [07]
└── HomeScreen.tsx                   [05 + 07]

src/services/api/
├── sessions.ts                      [07]
└── masters.ts                       [05]

src/services/storage/
└── pendingSession.ts                [07]

src/services/recording/
└── localCleanup.ts                  [04]

src/store/
├── generationSlice.ts               [07]
└── mastersSlice.ts                  [05]

src/hooks/
└── useSessionPolling.ts             [07]

src/components/
├── GeneratingAnimation.tsx          [07]
├── GeneratingTimeoutNotice.tsx      [07]
├── GeneratingFailureView.tsx        [07]
├── JustArrivedMasterCard.tsx        [07]
├── MasterAudioCard.tsx              [05]
└── EmptyMastersState.tsx            [05]

src/navigation/
└── types.ts                         [07 — Generating + Play params]
```

---

## v1.3.1 환경변수 체크리스트

```
MOCK_DSP=true                   # M0 전 ffmpeg 우회 (impl/02)
MOCK_LATENCY_MS=3000            # 기존 (impl/02)
MOCK_S3=true                    # 기존 — S3 mock 라우터 사용
S3_BUCKET=jajang-audio
S3_REGION=ap-northeast-2
REDIS_URL=...                   # Celery broker
DATABASE_URL=...                # PostgreSQL
JWT_PRIVATE_KEY / PUBLIC_KEY    # entitlement 평가 (impl/06)
```

`MOCK_GPU` / `INFERENCE_PROVIDER` / `MOCK_FAIL_RATE` 는 **v1.3.1 폐기** (구 AI 합성 시절 환경변수 — 코드 import 제거).

---

## 폐기 impl 7건 (v1.2.x AI 합성 기반)

| 폐기 파일 | 대체 |
|---|---|
| `01-server-generation-job.md` | `01-server-db-migration-0006.md` (RecordingSession/MasterAudio 기반) |
| `02-server-counter-enforcement.md` | `06-server-counter-enforcement.md` (Trial 인지 추가) |
| `03-server-inference-client.md` | (대체 X — DSP 는 ffmpeg 직접 호출, 추론 추상화 불필요) |
| `04-server-generation-pipeline.md` | `02-server-dsp-pipeline.md` (ffmpeg DSP) |
| `05-server-tracks-list.md` | `05-server-masters-list.md` (MasterAudio + cursor pagination) |
| `06-app-generating-screen.md` | `07-app-s12-pending.md` (30초 + SecureStore 복원) |
| `07-app-track-list-home.md` | `07-app-s12-pending.md` HomeScreen 통합 + `05-server-masters-list.md` 클라이언트 영역 |

**정리 방안 (메인 commit 단계 결정)**:
- 옵션 A: `_DEPRECATED.md` 접미사 rename → `01-server-generation-job_DEPRECATED.md`. git history 보존, 검색 시 표시.
- 옵션 B: `deprecated/` 서브디렉토리 이동 → `impl/deprecated/01-server-generation-job.md`. 폴더 분리 명확.
- **권고**: 옵션 B (deprecated/ 디렉토리). v1.3.1 신규와 파일명 충돌 회피 + 명시적. 메인이 `git mv` 단일 commit 으로 처리 가능.

---

## Epic 03 완료 기준 (v1.3.1 전체 수용)

### Story 1 — DB 마이그레이션
- [ ] `alembic upgrade head` / `alembic downgrade -1` 정상
- [ ] RecordingSession / Recording / MasterAudio CRUD + 관계 정상
- [ ] voice_samples / generated_tracks 테이블 부재 확인

### Story 2 — DSP 파이프라인
- [ ] MOCK_DSP=true → 3초 후 master_audios.status=completed
- [ ] N=1 클립 [A,A] acrossfade / N≥2 셔플 + concat 동작
- [ ] DSP 실패 → exponential backoff 재시도 (60/180/600s) → 3회 소진 시 status=failed

### Story 3 — Sessions API
- [ ] POST /sessions/init 멱등성 + 402 카운터 초과
- [ ] POST /sessions/{id}/recordings + /generate + GET /status 정합
- [ ] /generations/* 410 Gone

### Story 4 — Clip cleanup
- [ ] DSP 종료 시 schedule_delete_at = NOW() + 24h
- [ ] Celery Beat 1h 주기 → schedule_delete_at <= NOW() row S3 삭제 + s3_key=NULL
- [ ] S3 lifecycle rule 백업 적용

### Story 5 — Masters list
- [ ] GET /masters/me cursor pagination + has_pending
- [ ] HomeScreen 빈 상태 / pending 카드 / 목록 카드 정합

### Story 6 — Counter enforcement
- [ ] entitlement: free / trial / premium 분기 정합
- [ ] 무료 유저 count=3 → 402, Trial/Premium → skip
- [ ] DSP 성공 시 무료만 +1, Trial/Premium 변경 X

### Story 7 — S12 + pending 복원
- [ ] 5초 폴링 + 30초 timeout_notice + 재시도/홈이동 분기
- [ ] SecureStore session_id 복원 (completed/processing/failed/404 4분기)
- [ ] foreground 복귀 시 즉시 tick

---

## 다음 에픽 의존성

Epic 04 (재생 + 오디오 엔진) 시작 전 필요:
- `master_audios.s3_key` + `generate_presigned_url(s3_key)` → RNTP url
- `GeneratingScreen` → `PlayScreen` `navigation.replace({ url })` params 타입 확정
- `MasterAudioCard.onPlay` → PlayScreen presigned_url 전달
