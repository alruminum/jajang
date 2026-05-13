# Epic 19 — Local DSP Migration · Architecture (가설)

**상태**: 가설 (spec 확정 X). Story 1 spike 5 artifacts 결과로 Story 2/3 진입 여부 결정.
**작성일**: 2026-05-13
**관련**:
- PRD v1.4.x candidate 트랙 ([docs/PRD.md](../../PRD.md) §회고)
- Stories ([docs/epics/epic-19-local-dsp/stories.md](stories.md))
- ADR ([docs/epics/epic-19-local-dsp/adr.md](adr.md))
- 기존 서버 path ([docs/ARCHITECTURE.md](../../ARCHITECTURE.md) §음원 생성 시퀀스)

> 본 문서는 가설. `docs/ARCHITECTURE.md` (확정 spec) 본문 보강은 Story 1 spike PASS 후 별도 sub-PR 로 진행한다. 가설 단계 정보가 confirmed spec 처럼 보이면 후속 엔지니어가 측정 없이 구현 진입할 위험이 있음.

---

## 1. 범위 · 가정

### 본 epic 가 *추가* 하는 것

- mobile (iOS + Android, Expo Bare RN) 디바이스에서 직접 ffmpeg DSP 4 필터 chain (`afftdn` + `equalizer` + `aecho` + `acrossfade`) 실행 path
- 클라이언트 사이드 무료 3회 카운터 (서버 카운터 우회 시 단일 source 가 됨)
- 미래 sync 정책 — raw 녹음 영구 로컬 / 완성 mp3 만 서버 업로드

### 본 epic 가 *유지* 하는 것

- 서버 DSP 엔드포인트 (`/sessions/*` + Celery `dsp_process_task` + S3 업로드) **코드 살린 채로** MVP 클라이언트 미호출
- 기존 데이터 모델 (`RecordingSession` / `Recording` / `MasterAudio` / `GenerationCounter`) — 미래 sync 시 그대로 재활용

### 본 epic 가 *제거* 하는 것

- MVP 시점 서버 DSP path 의 *클라이언트 호출* 만. 배포 stop. 코드/스키마/마이그레이션 0 제거.

### 위협 모델 가정 (보안)

| 가정 | 근거 |
|---|---|
| raw 음성 = 생체 정보 → 디바이스 외 유출 0 정책 | PRD §F13 + ADR 철학 "법적 안전 우선" |
| 클라이언트 카운터 우회 가능 (re-install / 시간 조작) | RN AsyncStorage 평문, 우회는 BM 손실 ≤ 무시 가능 (분기점은 IAP 전환 압력) |
| ffmpeg 라이브러리 = LGPL → 동적 링크 + 라이선스 명시 의무 | App Store 정합 = Story 1 artifact #5 측정 후 결정 |
| App Store 심사 = LGPL 거부 가능성 0%~30% (Arthenica wiki "hard to achieve") | spike artifact 5 = LICENSE read + `-gpl` 변종명 부재 확인 |

---

## 2. Domain Model (압축)

> 기존 aggregate 재사용. 신규 entity 1개 추가.

| Entity / VO | 정의 | invariant | bounded context |
|---|---|---|---|
| **LocalGenerationJob** (신규 Entity) | 디바이스 내 단일 DSP 처리 작업 단위 (`job_id` = UUID, status enum, input recording uri, output mp3 uri) | status 는 단방향 (pending → processing → completed | failed). output mp3 uri 는 status=completed 일 때만 non-null | Mobile DSP |
| **LocalDSPCounter** (신규 VO) | 클라이언트 사이드 무료 3회 카운터 (`count` int, `limit` int=3) | count ≥ 0, count ≤ limit. 증가는 status=completed 직후 단일 트랜잭션 | Mobile DSP |
| **RecordingSession** (기존 재사용) | 1 녹음 세션 = 1 master 생성 단위 | 기존 정의 ([db-schema.md](../../db-schema.md)) | Server (보존, MVP 미호출) |
| **MasterAudio** (기존 재사용) | 완성 mp3 메타 | status / s3_key invariant 기존 유지 | Server (보존) + Future Sync (mp3-only upload) |
| **GenerationCounter** (기존 재사용) | 서버 카운터 (SELECT FOR UPDATE lock) | 기존 정의 | Server (보존, MVP 미호출). 미래 sync 도입 시 클라/서버 reconcile 필요 |

**Bounded Context 경계**: `Mobile DSP` ↔ `Server` 단방향. Mobile DSP context 는 Server context 모름. 미래 sync 도입 시점에 `Future Sync` context 가 양쪽 모두 의존 (mp3 만 upload, raw 0).

---

## 3. 시스템 구조 (Story 1 spike 후보 + Story 2 가설 구조)

### 3.1 라이브러리 후보 (Spike Gate — 측정 의무)

> 단일 라이브러리 결정은 spike 결과 의존. 본 문서는 *후보 순서* 만 박는다. Story 1 PASS 후 1개 선정 → ADR-19A 보강.

| 우선 | 후보 | 근거 | 결정적 리스크 |
|---|---|---|---|
| 1차 | `jdarshan5/ffmpeg-kit-react-native` fork | 본가 retire 후 활성 fork 중 LGPL 변종 보유, Android+iOS 동시 | semver 없음 + Expo Bare 통합 문서 없음 + 단일 binary release (2025-04-08) 만 |
| 2차 | `ffmpeg-expo` (kingjnr4 v0.0.1) | Expo 공식 인터페이스 따름 | 1 commit, production track record 없음, 4 필터 컴파일 미검증 |
| 3차 | 자체 native module (iOS AVAudioEngine + Android AudioEffect) | 라이선스 / 크기 통제 가능 | `afftdn` 동등 spectral noise reduction = custom DSP 직접 구현 (필터당 1~2주) |
| 폐기 | `@spreen/ffmpeg-kit-react-native` | iOS-only + GPL → App Store 불가 | 비교 가치 0 |
| 폐기 | `react-native-audio-api` (Software Mansion) | EQ + Reverb ✓ | `afftdn` 동등 missing, `acrossfade` missing, MP3 export 미확인 |
| 폐기 | `ffmpeg.wasm` on RN | — | Hermes / JSC WASM 미지원 |

### 3.2 Story 2 mobile path 구조 (가설)

> 1차 후보 (jdarshan5 fork) 가정. 2차/3차 fallback 시 모듈 경계는 동일, 내부 구현만 교체.

```
[apps/mobile/src/]

  screens/                       (기존 RecordModeScreen 등 — 호출 hook 만 교체)
       │
       │   (1) finalize recording → job dispatch
       ▼
  audio/local-dsp/               (신규 모듈)
       │
       ├─ LocalDspService.ts         ← 단일 진입점 (start / cancel / pollStatus)
       │       │
       │       │   (2) ffmpeg subprocess call
       │       ▼
       ├─ FfmpegBridge.ts            ← 1차: ffmpeg-kit-react-native fork 래퍼
       │       │                       2차: ffmpeg-expo 래퍼
       │       │                       3차: 자체 native module 래퍼
       │       │
       │       │   (3) 4 필터 chain (afftdn → equalizer → aecho → acrossfade → mp3)
       │       ▼
       ├─ DspPipeline.ts             ← 필터 인자 박힌 ffmpeg command 생성 (서버 DspService 와 동일 인자)
       │
       └─ LocalCounterRepo.ts        ← AsyncStorage 기반 무료 3회 카운터 (status=completed 직후 increment)

  services/api/generations.ts    (기존, MVP 미호출 — 호출 site 만 LocalDspService 로 교체)
  store/generationSlice.ts       (기존 sessionId/pollState 그대로, source 만 LocalDspService 가 됨)
```

### 3.3 의존 그래프 (인과관계 1줄씩)

```
screens (RecordModeScreen 등)
   │
   │  녹음 완료 시 DSP 진입 = UI 트리거 → 단일 service 호출만 필요
   ▼
LocalDspService
   │
   │  ffmpeg 호출 추상화 = 라이브러리 교체 가능성 (1차→2차→3차) 명시되어 있어 DIP 박음
   ▼
FfmpegBridge ──── (3-fallback strategy 교체)
   │
   │  command 문자열 빌드는 라이브러리 무관 = 서버 DspService 와 동일 인자 set, 분리 단위 명확
   ▼
DspPipeline (pure function, 라이브러리 의존 0)

LocalDspService
   │
   │  완료 시 카운터 증가 = lifecycle 동기화 (job 완료 ↔ counter +1) 단일 transaction 보장 의무
   ▼
LocalCounterRepo
```

### 3.4 독립성 자가 검증

| 모듈 | 단독 lifecycle? | 의존 부재 시 동작? | DIP 필요? |
|---|---|---|---|
| `DspPipeline` | ✓ (pure function, ffmpeg command 문자열만 생성) | ✓ (jest 단독 테스트 가능) | ✗ (concrete 1개로 충분) |
| `FfmpegBridge` | ✗ (네이티브 모듈 의존) | ✗ (real device + library 필요) | ✓ (3-fallback strategy → interface) |
| `LocalCounterRepo` | ✓ (AsyncStorage in-memory mock 가능) | ✓ (jest 단독) | ✗ (concrete, repo 패턴 자체가 추상) |
| `LocalDspService` | △ (FfmpegBridge mock + LocalCounterRepo mock 필요) | ✗ | ✗ (concrete, 위 3개 조합 단일 진입점) |

→ **DIP 박는 곳 = `FfmpegBridge` 단 1개**. 다른 모듈 추상화 X (남용 금지).

### 3.5 데이터 흐름 (Story 2 가설)

```
[Mobile only]

1. RecordModeScreen.onFinish()
   → LocalDspService.startJob({ inputUri, songKey })
2. LocalCounterRepo.peek() → count < 3 ? continue : throw FREE_LIMIT_REACHED
3. job = new LocalGenerationJob(status='pending')
   generationSlice.setSessionId(job.id), setPollState({status: 'pending'})
4. command = DspPipeline.build({ inputUri, songKey, outputUri })
   FfmpegBridge.execute(command) → status='processing'
5. ffmpeg complete:
   - success → output mp3 uri 반환 → LocalCounterRepo.increment() → status='completed' → generationSlice.setPollState({status: 'completed', uri})
   - fail    → status='failed'    → generationSlice.setPollState({status: 'failed', error})

   ※ 서버 호출 0. raw 녹음 / 완성 mp3 모두 디바이스 로컬 (FS) 잔존.
```

### 3.6 Story 3 서버 path 보존 구조

- 코드: `apps/api/app/api/v1/sessions.py` + `apps/api/app/tasks/dsp_processing.py` + `apps/api/app/services/dsp/*` + `apps/api/app/services/counter_repo.py` 모두 **삭제 0 / 변경 0**
- 배포: Celery 워커 stop + API 서버 stop (인프라 비용 0). 코드는 main 트리에 잔존
- 클라이언트: `apps/mobile/src/services/api/generations.ts` 파일 유지하되 호출 site 0 (lint warning 허용)
- 미래 sync 진입 시:
  1. mobile 완성 mp3 만 (raw 0) `POST /sessions/{id}/upload-master` 신규 엔드포인트 (Story 3 impl 에서 *경로명만 박고* 미구현)
  2. 서버 `MasterAudio` 테이블 재활성화, S3 업로드만 수행 (DSP 처리는 mobile 에서 이미 완료)
  3. `GenerationCounter` 서버측 카운터는 클라 카운터와 reconcile (방식 = 본 epic 미결, V2+ 결정)

---

## 4. NFR 목표

| 영역 | 목표 | 측정 방법 |
|---|---|---|
| 성능 | Story 1 측정 — 저사양 Android (Galaxy A) 30초 입력 → ≤ 30초 처리 (서버 NFR 동등) | spike artifact #3 |
| 가용성 | 디바이스 단독 (네트워크 의존 0) → 새벽 와이파이 끊긴 환경 동작 | Story 2 (TEST) airplane mode E2E |
| 보안 | raw 녹음 디바이스 외 유출 0 | 코드 grep — upload 호출 site 0 (Story 2 impl 수용 기준) |
| 관찰가능성 | 로컬 로그만 (server-side analytics 없음) → 익명 통계 = MVP 미수집 | N/A (privacy 우선) |
| 비용 | 인프라 비용 0 (Celery worker stop + API server stop) | deploy 정지 확인 (Story 3 impl) |
| 앱 크기 | ipa/apk 델타 ≤ +50MB (1차 후보 full variant 측정 105MB → spike NO_GO 분기) | spike artifact #4 |

---

## 5. 기술 리스크 + 완화

| 리스크 | 가능성 | 영향 | 완화 |
|---|---|---|---|
| 1차 후보 fork (jdarshan5) Expo Bare 통합 실패 | 중 | high (spike 폐기) | 2차/3차 fallback 절차 박힘. NO_GO 시 V2+ 이관 |
| LGPL App Store 심사 거부 | 저~중 | catastrophic (epic 폐기) | 변종명 `-gpl` 부재 + LICENSE read = artifact 5. 동적 링크 검증 spike 절차 박음 |
| 저사양 Android 처리시간 > 30초 | 중 | high (UX 저하) | spike artifact #3 측정 → 30초 초과 시 *백그라운드 처리 + 진행률 UI* 추가 박는 plan B (Story 2 impl 결정) |
| 앱 크기 +105MB | 중 | high (다운로드 이탈) | `min` 변종 + 아키텍처별 분할 (Android ABI split, iOS thinning) — Story 1 spike 후 측정 |
| 클라 카운터 우회 (re-install) | 고 | low (BM 손실 ≤ 무시) | 미완화 수용 (PRD 우선순위). 미래 sync 진입 시 서버 reconcile |
| ffmpeg-kit 본가 retire → fork 이슈 응답 0 | 확정 | medium (bug fix 자체 책임) | Story 3 ADR-19A 에 "fork 변경 / 자체 native 전환 trigger 조건" 명시 |

---

## 6. 구현 순서 + 의존 chain

```
01 spike-fork-eval                  ← 라이브러리 선정 (artifact #1 build)
       │
       ▼
02 spike-filter-probe               ← ffprobe -filters (artifact #2)
       │
       ▼
03 spike-device-perf-size-license   ← 처리시간 (#3) + 앱 크기 (#4) + LGPL (#5) 일괄
       │
       ▼  (5 artifacts 모두 PASS 시에만 진입)
04 mobile-local-dsp-module          ← Story 2: LocalDspService + DspPipeline + FfmpegBridge + LocalCounterRepo
       │
       ▼
05 mobile-screens-hookup            ← Story 2: RecordModeScreen 등 hook 교체 (서버 호출 → LocalDspService)
       │
       ▼
06 server-path-preserve-and-sync-policy   ← Story 3: 서버 코드 보존 명시 + 미래 sync 정책 ARCHITECTURE.md/ADR.md 박음
```

근거:
- 01~03 = spike 직렬 (앞 artifact PASS 가 다음의 전제. 1차 후보 fail 시 라이브러리 교체 → 01 재진입)
- 04 = Story 2 진입. 모듈 단위 분리는 *테스트 단위 정합* 우선 (DspPipeline 단독 jest 가능, FfmpegBridge real device 분리)
- 05 = UI hook 교체. 04 PASS 후 단일 sub-PR
- 06 = Story 3. 코드 변경 minimal (문서 위주). 04/05 와 병행 가능하나 sync 정책이 04 설계에 영향 줄 수 있어 04 이후 권장

---

## 7. 모듈 분할 3 정합 self-check

1. **Bounded context 정합** — `Mobile DSP` context = `audio/local-dsp/` 단일 디렉토리. `Server` context (보존) 와 분리. ✓
2. **테스트 단위 정합** — `DspPipeline` 단독 jest / `LocalCounterRepo` AsyncStorage mock jest / `FfmpegBridge` real-device E2E / `LocalDspService` 통합 jest. 각 모듈 PASS/FAIL 명확. ✓
3. **의존성 1 묶음 정합** — `audio/local-dsp/` 내부 강결합 OK, 외부와는 `LocalDspService` interface 단일 진입점 + `generationSlice` (기존) 만. ✓

---

## 8. impl 목차

| NN | impl 파일명 | 대응 Story | task_index | depth | 의존 | 1줄 요약 |
|----|-------------|-----------|-----------|-------|------|---------|
| 01 | 01-spike-fork-eval.md | Story 1 | 1/3 | deep | — | 1차 후보 (jdarshan5 fork) build + iOS/Android real device 동작 확인 (artifact #1) |
| 02 | 02-spike-filter-probe.md | Story 1 | 2/3 | std | 01 | `ffprobe -filters` 출력 4 필터 컴파일 증거 (artifact #2) |
| 03 | 03-spike-device-perf-size-license.md | Story 1 | 3/3 | deep | 02 | 디바이스별 30초 처리시간 (#3) + ipa/apk 델타 (#4) + LGPL 확정 (#5) 일괄 측정 + GO/NO_GO 결정 |
| 04 | 04-mobile-local-dsp-module.md | Story 2 | 1/2 | std | 03 | `LocalDspService` + `DspPipeline` + `FfmpegBridge` + `LocalCounterRepo` 모듈 구현 + jest |
| 05 | 05-mobile-screens-hookup.md | Story 2 | 2/2 | std | 04 | RecordModeScreen 등 hook 교체 (서버 호출 → LocalDspService) + airplane mode E2E |
| 06 | 06-server-path-preserve-and-sync-policy.md | Story 3 | 1/1 | simple | 04 | 서버 코드 보존 명시 (변경 0 PR) + 미래 sync 정책 ARCHITECTURE.md/ADR.md 박음 |

**규칙**:
- 03 = GO/NO_GO 게이트. FAIL 시 04~06 모두 폐기 또는 V2+ 이관 (architect 재진입)
- 04 의 `FfmpegBridge` 는 03 에서 결정된 라이브러리 1개 concrete 구현
- 06 은 04 와 병행 가능하나 sync 엔드포인트 *경로명 박음* 이 04 의 데이터 모델에 영향 줄 수 있어 04 이후 권장
- duel mode (UI 컴포넌트 + design.md components) 적용 X — 본 epic UI 변화 0

**메인 호출 절차**: 위 6 행 순차로 module-architect 1회씩 호출. 각 호출 prompt 에 `task_index` (예: `1/3`) 박아 module-architect 가 impl 파일 frontmatter 에 박도록 지시. 03 PASS 후 04 진입 결정은 메인 (or 사용자) 판단.

---

## 9. Spike Gate 결과 (현 시점)

| 외부 의존 | 상태 | 검증 SDK/모델 | 비고 |
|---|---|---|---|
| ffmpeg 4 필터 chain mobile 실행 | **PENDING** (Story 1 spike 의 본질 자체) | — | 본 architecture.md = **가설**. spike 5 artifacts PASS 전 Story 2 entry 금지 |
| LGPL App Store 정합 | **PENDING** (artifact #5) | — | 변종명 `-gpl` 부재 + LICENSE read 의무 |

> 본 epic 의 Spike Gate 는 *본 architecture.md 가 spike 절차 자체를 설계한다* 는 점에서 **spike-driven epic 패턴** (ADR-19D). PRD spec 확정을 spike 결과로 미루는 것이 정답. `MockFfmpegBridge` 만 박고 PASS 처리하는 안티패턴 명시 금지 — Story 1 spike 3 task 모두 real-device 측정 의무.
