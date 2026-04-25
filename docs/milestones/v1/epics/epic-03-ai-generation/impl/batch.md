# Epic 03 — Impl 실행 순서 및 의존성

**Epic**: 03 — AI 음원 생성  
**Impl 수**: 7개 (01~07)  
**생성일**: 2026-04-24

---

## 실행 순서

```
01-server-generation-job
        │
        ▼
02-server-counter-enforcement ──────────┐
        │                               │
        ▼                               │
03-server-inference-client              │
        │                               │
        ▼                               │
04-server-generation-pipeline ◀─────────┘
  (02 + 03 모두 완료 후)
        │
        ▼
05-server-tracks-list
        │
        ├─────────────────────┐
        ▼                     ▼
06-app-generating-screen  07-app-track-list-home
(04 서버 완료 후)         (05 서버 완료 후)
```

06과 07은 서버 완료 후 병렬 진행 가능. 1인 개발 기준 순차 진행 권장.

---

## Impl 요약표

| 파일 | depth | 커버 스토리 | 선행 impl | 예상 소요 |
|---|---|---|---|---|
| 01-server-generation-job.md | std | Story 2 (모델/마이그) | Epic01+02 완료 | 2~3h |
| 02-server-counter-enforcement.md | **deep** | Story 6 (횟수 제한) | 01 | 3~4h |
| 03-server-inference-client.md | std | Story 2 (추론 추상화) | 01 | 2~3h |
| 04-server-generation-pipeline.md | std | Story 2,3,4 (파이프라인) | 02+03 | 5~6h |
| 05-server-tracks-list.md | std | Story 5 (트랙 목록) | 01+04 | 2~3h |
| 06-app-generating-screen.md | std | Story 1,3 (S12) | 04 서버 | 4~5h |
| 07-app-track-list-home.md | std | Story 5 + Story 1 (S06) | 05 서버 + 06 | 4~5h |

**총 예상 소요**: 22~29시간 (1인 주말 개발 기준 3주말)

---

## 병렬 실행 가능 구간

```
[Week 1 — 서버 기반]
  01 → 02, 03 동시 시작 가능 (01 완료 후)
       ↓
  04 (02+03 완료 후)
       ↓
  05

[Week 2 — 앱 연동]
  서버 04 완료 후: 06 시작
  서버 05 완료 후: 07 시작 (06 완료 이후도 가능)
```

---

## 서버 환경변수 체크리스트

Epic 03 구현 전 `.env` 또는 서버 시크릿 스토어 확인:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MOCK_GPU` | `true` | M0 전까지 반드시 `true` 유지 |
| `INFERENCE_PROVIDER` | `mock` | M0 후 `replicate` 또는 `modal`로 변경 |
| `MOCK_LATENCY_MS` | `3000` | Mock 추론 대기 시간 (개발 체감용) |
| `MOCK_FAIL_RATE` | `0.0` | 실패 경로 테스트 시 `0.5` 등으로 설정 |
| `S3_BUCKET_NAME` | — | mp3 저장 + sample presign 공유 버킷 |
| `REDIS_URL` | — | Celery 브로커 |

---

## 신규 파일 목록 (engineer 참조용)

### 서버 (`apps/api/`)
```
app/models/generated_track.py
app/models/generation_counter.py        (Epic 01 미작성 시)
app/migrations/versions/003_generated_tracks.py
app/schemas/generations.py
app/schemas/tracks.py
app/services/counter_service.py
app/services/generation_service.py
app/services/tracks_service.py
app/services/storage_service.py         (수정 — mp3 upload/presign 추가)
app/services/inference/__init__.py
app/services/inference/base.py
app/services/inference/mock_client.py
app/services/inference/factory.py
app/tasks/generation.py
app/api/v1/generations.py
app/api/v1/tracks.py
app/core/db.py                          (수정 — SyncSessionLocal 추가)
app/core/config.py                      (수정 — MOCK_GPU 등 환경변수 추가)
```

### 앱 (`apps/mobile/`)
```
src/screens/GeneratingScreen.tsx
src/screens/HomeScreen.tsx              (수정 — 트랙 목록 통합)
src/services/api/generations.ts
src/services/api/tracks.ts
src/store/generationSlice.ts
src/components/TrackCard.tsx
src/navigation/types.ts                 (수정 — Generating screen 타입)
```

---

## M0 이후 교체 포인트

| 파일 | 교체 내용 |
|---|---|
| `inference/factory.py` | `INFERENCE_PROVIDER=replicate` 분기 주석 해제 |
| `inference/replicate_client.py` | `VoiceInferenceClient` 상속 구현체 신규 작성 |
| `.env` | `MOCK_GPU=false`, `REPLICATE_API_TOKEN=...` 추가 |
| `placeholder mp3` | `mock_client.py` `_PLACEHOLDER_MP3_B64` → ffmpeg 생성 실제 무음 mp3로 교체 |

---

## Epic 03 완료 기준 (전체 수용 기준 체크)

### Story 1 — 생성 중 대기 화면
- [ ] S12 달·별 애니메이션 + "약 30~90초 걸려요" + 90초 카운트다운
- [ ] 5초 간격 폴링 → completed 수신 → S13 자동 이동
- [ ] "홈으로 돌아가기" 탭 → S06 이동, activeJobId persist
- [ ] 백그라운드 이동 후 포그라운드 복귀 → pollOnce() 즉시 실행

### Story 2 — AI 생성 API 연동
- [ ] POST /generations/init (job_id, voice_sample_id, song_key) → 201
- [ ] GET /generations/{job_id} 5초 폴링 → completed + presigned_url
- [ ] MOCK_GPU=true 환경에서 E2E 플로우 동작 (S11 → S12 → S13)
- [ ] 90초 이내 mp3 반환 (M0 이후 실제 모델 기준)
- [ ] 완료 후 presigned URL로 mp3 직접 접근 가능

### Story 3 — 생성 실패 처리
- [ ] MOCK_FAIL_RATE=1.0 → S12 실패 상태 + "다시 시도" + "홈으로 이동"
- [ ] "다시 시도" → 새 job_id + 재생성 (카운터 차감 없음 확인)
- [ ] "홈으로 이동" → S06 이동

### Story 4 — 목소리 샘플 서버 자동 삭제
- [ ] 생성 완료 후 voice_sample.schedule_delete_at = now() + 24h 확인
- [ ] 생성 실패 후에도 schedule_delete_at 세팅 확인
- [ ] Epic 02 Celery Beat 24h 스케줄러가 삭제 실행 (Epic 02 범위이나 연동 확인)

### Story 5 — 홈 화면 음원 목록
- [ ] GET /tracks → 트랙 목록 반환 (completed + pending + failed)
- [ ] completed 트랙 카드 + ▶ → S13
- [ ] pending 트랙 카드 + 탭 → S12 복귀 (동일 job_id)
- [ ] 빈 상태 → "아직 자장가가 없어요" + "자장가 만들기" CTA
- [ ] 트랙 삭제 (롱탭 → Alert → API) → 목록에서 제거

### Story 6 — 생성 횟수 카운터
- [ ] 무료 유저 3회 소진 → POST /generations/init → 402 → S14 팝업
- [ ] 생성 성공 후 counter +1 (DB 확인)
- [ ] 재시도(새 job_id, 실패 후) → counter 차감 없음 확인
- [ ] 프리미엄/트라이얼 유저 → 횟수 무제한 (counter 변경 없음)
- [ ] SELECT FOR UPDATE 동시 요청 테스트 (count=2 상태에서 동시 2요청 → 하나만 성공)

---

## 다음 에픽 의존성

Epic 04 (재생 + 오디오 엔진) 시작 전 필요:
- `generated_tracks.s3_key` + presigned URL 발급 흐름 — RNTP에 URL 전달
- `GeneratingScreen` → `PlayScreen` navigation.replace 파라미터 타입 확정
- `TrackCard.onPlay` → PlayScreen 진입 presignUrl 전달
