# Epic 03 — DSP 음원 후처리 생성

**GitHub Epic Issue:** [#190](https://github.com/alruminum/jajang/issues/190)

> **[v1.3.1 피벗 (2026-04-30)]**: 에픽 명칭 변경 ("AI 음원 생성" → "DSP 음원 후처리 생성"). GPU/AI 합성 관련 Story 1~6 전부 폐기. ffmpeg DSP 파이프라인 + 신규 데이터 모델(RecordingSession/Recording/MasterAudio) 기반으로 전면 재정의.
>
> **폐기된 story/impl 목록**:
> - Story 1 (생성 중 대기 화면) — 클라이언트 폴링 흐름 재정의로 신규 Story 3으로 대체
> - Story 2 (AI 생성 API 연동 — GPU 추론 기반) — `impl/01~04` 전부 폐기 대상 (VoiceSample ORM, GeneratedTrack ORM, VoiceInferenceClient ABC, GPU Celery task)
> - Story 3 (생성 실패 처리 — GPU 타임아웃 90초) — DSP 30초 기준으로 재정의
> - Story 4 (목소리 샘플 서버 자동 삭제) — 신규 Recording 모델 기반으로 통합
> - Story 5 (홈 화면 음원 목록) — MasterAudio 기반으로 신규 Story 5로 대체
> - Story 6 (AI 생성 횟수 카운터) — DSP 카운터로 명칭만 변경, 로직 동일

**포함 기능:** F4 (음원 후처리 생성 — DSP)  
**선행 조건:** Epic 02 완료 (검증된 녹음 클립 업로드 완료)  
**완료 기준:** ffmpeg DSP 처리 완료 → master.mp3 S3 저장 → 클라이언트 다운로드 → 재생 화면 진입 가능

---

## Story 1 — DB 모델 마이그레이션 (Alembic 0006) [x]

**GitHub Issue:** [#191](https://github.com/alruminum/jajang/issues/191)

**As a** 시스템  
**I want** RecordingSession / Recording / MasterAudio 테이블을 신설하고 구 테이블을 폐기하고 싶다  
**So that** DSP 기반 음원 생성 파이프라인이 올바른 데이터 모델 위에서 동작할 수 있다

> 구 테이블: `voice_samples` (migration 002), `generated_tracks` (migration 003) → 폐기.  
> 신규 테이블: `recording_sessions`, `recordings`, `master_audios`.

### 태스크 체크리스트

- [x] `migrations/versions/006_dsp_recording_model.py` 작성 (upgrade/downgrade)
- [x] `recording_sessions` 테이블: id, user_id, song_key, status, idempotency_key, created_at
- [x] `recordings` 테이블: id, session_id, s3_key, duration_ms, is_validated, created_at, schedule_delete_at
- [x] `master_audios` 테이블: id, session_id, s3_key, status, dsp_duration_ms, error_message, created_at, completed_at
- [x] `voice_samples` DROP (downgrade에서 re-create)
- [x] `generated_tracks` DROP (downgrade에서 re-create)
- [x] SQLAlchemy ORM 신규 작성: `RecordingSession`, `Recording`, `MasterAudio`
- [x] ORM 기존 참조 제거: `VoiceSample`, `GeneratedTrack` 폐기 (파일 보존, import 제거)
- [x] `alembic upgrade head` 정상 실행 확인

### 수용 기준

- Given `alembic upgrade head` / When 실행 / Then 0006 migration 오류 없음
- Given `alembic downgrade -1` / When 실행 / Then 0006 롤백 정상
- Given `recording_sessions` INSERT / When idempotency_key 중복 / Then UNIQUE 위반 오류
- Given `recordings` INSERT / When schedule_delete_at = NULL / Then 허용 (생성 완료 전)
- Given `master_audios.status` / When 'unknown' 값 INSERT / Then CHECK constraint 위반

**관련 impl**: `impl/01-server-db-migration-0006.md`

---

## Story 2 — DSP 서버 파이프라인 (ffmpeg + Celery) [x]

**GitHub Issue:** [#192](https://github.com/alruminum/jajang/issues/192)

**As a** 시스템  
**I want** 업로드된 녹음 클립에 ffmpeg DSP를 적용해 master.mp3를 생성하고 싶다  
**So that** 부모 목소리가 노이즈 제거 + EQ + reverb + crossfade로 정제된 자장가 음원을 제공할 수 있다

### 태스크 체크리스트

- [x] `services/dsp/ffmpeg_service.py`: DspService 클래스 구현
  - [x] `afftdn` 노이즈 제거 단계
  - [x] `equalizer` EQ 필터 단계
  - [x] `aecho` reverb 단계
  - [x] `acrossfade` concat 단계 (d=0.3, c1=c2=tri)
  - [x] N=1 처리: `ffmpeg -i A -i A acrossfade` (단순 반복 준비)
  - [x] N≥2 처리: Fisher-Yates 직전 클립 제외 셔플 → 체인 concat
- [x] `MOCK_DSP=true` 환경: `MockDspService` — 실제 ffmpeg 미실행, 3초 대기 후 placeholder mp3 반환
- [x] `tasks/dsp_processing.py`: Celery DSP task
  - [x] `max_retries=3`, `countdown=exponential backoff (60/180/600s)`
  - [x] on_failure: `master_audios.status=failed` + Sentry 알림 (structlog fallback)
  - [x] `acks_late=True`, `soft_time_limit=35`, `time_limit=60`
- [x] S3 다운로드 `/tmp/` → DSP → S3 업로드 → `/tmp/` 정리 순서 보장
- [x] DSP 완료 후: `master_audios.status=completed` + `counter +1` (무료 유저) + `recordings.schedule_delete_at = NOW() + 24h`

### 수용 기준

- Given `MOCK_DSP=true` / When Celery task 실행 / Then 3초 후 `master_audios.status=completed`
- Given `MOCK_DSP=true` + 무료 유저 / When Celery task 완료 / Then 카운터 차감 없음 (개발 환경 소진 방지)
- Given N=1 클립 / When DSP 실행 / Then 셔플 concat 미적용 + DSP 후처리(노이즈/EQ/reverb/crossfade) 정상
- Given N≥2 클립 / When DSP 실행 / Then 직전 클립 제외 Fisher-Yates 셔플 + acrossfade concat
- Given DSP 처리 실패 / When 3회 재시도 후 / Then `master_audios.status=failed` + Sentry 알림
- Given DSP 성공 / When 완료 / Then `recordings.schedule_delete_at = NOW() + 24h` 설정 확인
- Given DSP 성공 (무료 유저, MOCK_DSP=false) / When 완료 / Then `generation_counters.count +1` 확인

**관련 impl**: `impl/02-server-dsp-pipeline.md`

---

## Story 3 — 세션/녹음/마스터 API (POST /sessions + recordings + generate) [x]

**GitHub Issue:** [#193](https://github.com/alruminum/jajang/issues/193)

**As a** 클라이언트  
**I want** 녹음 세션 생성 → 클립 등록 → DSP 생성 트리거를 REST API로 처리하고 싶다  
**So that** 구 `/generations` 라우터를 완전 대체할 수 있다

### 태스크 체크리스트

- [x] `api/v1/sessions.py` 라우터 신규 작성
  - [x] `POST /sessions/init` — 세션 생성 (idempotency_key 기반 멱등)
  - [x] `POST /sessions/{id}/recordings` — 클립 등록 (presigned upload URL 발급)
  - [x] `POST /sessions/{id}/generate` — DSP Celery task dispatch
  - [x] `GET /sessions/{id}/status` — 생성 상태 폴링 (5초 간격)
  - [x] `GET /masters/me` — 완료된 음원 목록 (S06 홈)
- [x] `api/v1/generations.py` → 410 Gone 처리 (구 클라이언트 호환)
- [x] 카운터 초과 시 `POST /sessions/init`에서 402 반환 → 클라이언트 S14 팝업
- [x] 생성 완료 후 홈 "생성 완료 음원 있음" 카드 데이터 포함 (GET /masters/me 응답)
- [x] `main.py`: sessions router include, generations router 410 전환 확인

### 수용 기준

- Given 무료 유저 count=3 / When `POST /sessions/init` / Then 402 `GENERATION_LIMIT_EXCEEDED`
- Given 정상 요청 / When `POST /sessions/init` / Then 201 + session_id + presigned_url
- Given 동일 idempotency_key 재요청 / When / Then 기존 session_id 반환 (새 세션 생성 안 함)
- Given `POST /sessions/{id}/generate` / When / Then Celery task 큐 등록 확인
- Given 생성 중 / When `GET /sessions/{id}/status` / Then `{ status: 'processing' }`
- Given 생성 완료 / When `GET /sessions/{id}/status` / Then `{ status: 'completed', presigned_url: ... }`
- Given `GET /api/v1/generations/init` / When 구버전 클라이언트 요청 / Then 410 Gone

**관련 impl**: `impl/03-server-sessions-api.md`

---

## Story 4 — 녹음 샘플 서버 자동 삭제 (24h TTL)

**GitHub Issue:** [#194](https://github.com/alruminum/jajang/issues/194)

**As a** 시스템  
**I want** DSP 완료 후 업로드된 녹음 클립을 24시간 이내 삭제하고 싶다  
**So that** 생체정보를 최소 기간만 보관하고 법적 요건(PRD §F13)을 충족할 수 있다

### 태스크 체크리스트

- [ ] DSP 성공/실패 시 모두 `recordings.schedule_delete_at = NOW() + 24h` 설정 (Story 2에서 통합)
- [ ] Celery Beat task `clip_cleanup`: 1시간 주기, `schedule_delete_at <= NOW()` 대상 S3 삭제 + `recordings.s3_key = NULL`
- [ ] S3 lifecycle rule 백업 (24h TTL, Celery 실패 대비)
- [ ] 삭제 완료 structlog 기록 (파일 ID + 타임스탬프)
- [ ] 클라이언트 로컬 임시 녹음 파일: 업로드 완료 후 삭제 (`expo-file-system deleteAsync`)

### 수용 기준

- Given DSP 완료 / When 완료 이벤트 / Then `recordings.schedule_delete_at` = NOW() + 24h 설정
- Given `schedule_delete_at` 도달 / When Celery Beat 실행 / Then S3 파일 삭제 + `s3_key = NULL`
- Given Celery 미실행 상태 / When 24h 경과 / Then S3 lifecycle rule 자동 삭제 (백업)
- Given 삭제 완료 / When / Then structlog `clip.deleted` 기록 (recording_id + timestamp)

---

## Story 5 — 홈 화면 음원 목록 (MasterAudio 기반)

**GitHub Issue:** [#195](https://github.com/alruminum/jajang/issues/195)

**As a** 유저  
**I want** 내가 생성한 음원 목록을 홈에서 확인하고 싶다  
**So that** 이전에 만든 자장가를 바로 재생할 수 있다

> v1.3.1: `GeneratedTrack` → `MasterAudio` 기반으로 데이터 소스 변경.

### 태스크 체크리스트

- [ ] `GET /masters/me` API: 완료된 MasterAudio 목록 반환 (곡명, 생성일, presigned URL)
- [ ] 홈 화면: 생성된 음원 카드 목록 (곡명 + 생성일 + 재생 버튼)
- [ ] 생성된 음원 없을 시: 빈 상태 UI + "자장가 만들기" CTA
- [ ] 음원 카드 탭 → 재생 화면(S13) 이동
- [ ] 생성 완료 후 홈 재진입 시: "생성 완료 음원 있음" 카드 자동 노출 (배지 + 탭 시 S13)
- [ ] 현재 재생 중인 음원 상태 갱신 (MasterAudio의 세션 식별자 기반)

### 수용 기준

- Given 음원 생성 완료 / When 홈 진입 / Then 목록에 신규 음원 카드 노출
- Given 음원 없음 / When 홈 진입 / Then 빈 상태 + "자장가 만들기" CTA
- Given 생성 중 앱 종료 후 재진입 / When 홈 진입 / Then "생성 완료 음원 있음" 카드 자동 노출
- Given 카드 탭 / When / Then 해당 음원 재생 화면(S13) 이동

---

## Story 6 — DSP 생성 횟수 카운터 서버사이드 enforcement

**GitHub Issue:** [#196](https://github.com/alruminum/jajang/issues/196)

**As a** 시스템  
**I want** 무료 유저의 DSP 음원 생성 횟수를 계정 단위로 서버사이드에서 제한하고 싶다  
**So that** 클라이언트 우회를 막고 구독 전환 압력을 형성할 수 있다

> v1.3.1: AI → DSP 명칭 변경. 카운터 로직 동일 (기존 generation_counters 테이블 재사용).

### 태스크 체크리스트

- [ ] `generation_counters` 테이블 재사용 (Epic 01 구현)
- [ ] `POST /sessions/init` 에서 SELECT FOR UPDATE 카운터 체크
- [ ] DSP 성공 시에만 카운터 +1 (재시도 차감 없음)
- [ ] 무료 유저 count >= 3 → 402 즉시 반환
- [ ] 트라이얼 만료 후 무료 다운그레이드: 카운터 리셋 없음 (기존 소진 횟수 유지)

### 수용 기준

- Given 무료 유저 count=3 / When 생성 API 요청 / Then 402 응답 + 클라이언트 S14 팝업
- Given DSP 실패 후 재시도 / When 동일 session_id 재생성 / Then 카운터 추가 차감 없음
- Given Premium 유저 / When 생성 API 요청 / Then 카운터 체크 skip
- Given Trial 유저 (7일 체험 중) / When 생성 API 요청 / Then 카운터 체크 skip (Premium 동등 취급) + DSP 완료 후 카운터 +1 없음
- Given Trial 만료 후 무료 다운그레이드 / When 이미 Trial 전 2회 소진 상태 / Then `generation_counter = 2` 유지 (Trial 기간 생성분 무가산, 1회만 추가 허용)

---

## Story 7 — 생성 중 대기 화면 & 실패 처리 (S12, 클라이언트)

**GitHub Issue:** [#197](https://github.com/alruminum/jajang/issues/197)

**As a** 유저  
**I want** DSP 생성이 진행 중임을 시각적으로 확인하고, 실패 시 재시도하거나 홈으로 이동하고 싶다  
**So that** 앱이 멈춘 건지 처리 중인지 알 수 있고, 실패 시 당황하지 않고 대처할 수 있다

> v1.3.1: 예상 시간 안내 "30초 이내" (구 90초 → 30초). 홈으로 이동 후 완료 카드 자동 노출.

### 태스크 체크리스트

- [ ] S12 생성 중 애니메이션 UI + "30초 이내" 예상 시간 안내
- [ ] `GET /sessions/{id}/status` 5초 간격 폴링 (서버 status 가 completed/failed 도달 시까지 계속)
- [ ] 생성 완료 (`status=completed`) 수신 → S13 재생 화면 자동 이동
- [ ] 클라이언트 30초 경과 시: "처리 중 (재시도 대기)" 메시지 + 재시도 버튼 *비활성* + "홈으로 이동" 버튼 활성 노출 (Celery retry 진행 중 중복 task 방지)
- [ ] 클라이언트 30초 이후에도 폴링 계속 유지 — 서버 `status=completed` 도달 시 S13 자동 이동
- [ ] 서버 `status=failed` (Celery 재시도 모두 소진) 도달 시: 재시도 버튼 활성 + 실패 메시지 노출
- [ ] 재시도 (`status=failed` 후): 동일 session_id POST 재요청 (횟수 차감 없음)
- [ ] "홈으로 이동": 항상 활성 → S06 홈 이동 → 완료 시 "생성 완료 음원 있음" 카드 자동 노출

### 수용 기준

- Given 생성 요청 완료 / When 대기 화면 / Then 애니메이션 + "30초 이내" 안내 노출
- Given 생성 성공 / When `status=completed` 수신 / Then S13 재생 화면 자동 이동
- Given 클라이언트 30초 경과 / When 서버 `status=processing` 중 / Then "처리 중 (재시도 대기)" 메시지 표시 + 재시도 버튼 비활성 + "홈으로 이동" 버튼 활성
- Given 클라이언트 30초 이후 폴링 중 / When `status=completed` 수신 / Then 즉시 S13 재생 화면 이동
- Given 서버 `status=failed` (Celery 재시도 전부 소진) / When 폴링 수신 / Then 재시도 버튼 활성 + 에러 메시지 노출
- Given 재시도 버튼 탭 (`status=failed` 후) / When / Then 동일 session_id 재요청 (새 세션 생성 X, 횟수 차감 X)
- Given 홈으로 이동 탭 / When 서버 처리 중이든 완료든 / Then 즉시 S06 이동 가능
- Given 홈으로 이동 후 / When 서버 처리 완료 / Then 홈에 "생성 완료 음원 있음" 카드 자동 노출

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic (v1.3.1 신규) | [#190](https://github.com/alruminum/jajang/issues/190) |
| 구 Epic (AI 합성 기반) | [#58](https://github.com/alruminum/jajang/issues/58) — closed, v1.3.1 피벗으로 대체 |
| 구 Story 1~6 (AI 합성 기반) | [#59](https://github.com/alruminum/jajang/issues/59)~[#64](https://github.com/alruminum/jajang/issues/64) — closed, v1.3.1 피벗으로 폐기 |
| Story 1 (DB 마이그레이션 0006) | [#191](https://github.com/alruminum/jajang/issues/191) |
| Story 2 (DSP 파이프라인) | [#192](https://github.com/alruminum/jajang/issues/192) |
| Story 3 (세션 API) | [#193](https://github.com/alruminum/jajang/issues/193) |
| Story 4 (클립 삭제) | [#194](https://github.com/alruminum/jajang/issues/194) |
| Story 5 (홈 목록 MasterAudio) | [#195](https://github.com/alruminum/jajang/issues/195) |
| Story 6 (카운터 enforcement) | [#196](https://github.com/alruminum/jajang/issues/196) |
| Story 7 (S12 대기 화면) | [#197](https://github.com/alruminum/jajang/issues/197) |
