---
depth: simple
design: not-required
story: 2
task_index: 1/3
---

# 08 — sample-asset-fixtures

Story 2 AC-1 측정에 필요한 fixture audio asset 을 `apps/mobile/assets/samples/` 에 박는 task.
DSP 모듈 (task 09) 진입 전 입력 파일 2개가 실기기 번들 안에 존재해야 한다.

---

## 사전 준비 (먼저 read 필수)

아래 파일들을 읽고 프로젝트 아키텍처와 설계 의도를 파악한 뒤 작업하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.2 Story 2 mobile path 구조 + §6 구현 순서 + §8 impl 목차
- `docs/epics/epic-19-local-dsp/stories.md` — Story 2 AC-1 수용 기준
- `apps/api/app/services/songs_service.py` — 자장가 목록 + preview S3 key 매핑 (공개도메인 확인)
- `apps/api/static/previews/` — 재사용 후보 WAV 파일 실존 확인 (`brahms_preview.wav` 등 6개)
- `apps/mobile/package.json` — expo 버전 확인 (expo-asset 포함 여부)
- `apps/mobile/src/assets/` — 기존 asset 관리 패턴 (`require('../assets/logo.png')`)

---

## Scope

**본 task 가 다루는 것:**

- `apps/mobile/assets/samples/` 디렉토리 신설
- 자장가 음원 1개 (`lullaby-sample.wav`) 박음
- 부모 목소리 샘플 1개 (`voice-sample.wav`) 박음
- `apps/mobile/assets/samples/README.md` — 출처/라이선스/사용 의도 명시
- `apps/mobile/src/assets/sample-fixtures.ts` — `require()` import 진입점

**본 task 가 건드리지 않는 것:**

- `apps/mobile/src/audio/local-dsp/` (task 09 영역 — 절대 손대지 마라. 이유: 미생성 모듈)
- `apps/mobile/src/screens/` (task 10 영역)
- `apps/api/` 서버 코드 일체
- `apps/mobile/assets/samples/` 이외 디렉토리의 기존 파일

---

## 인터페이스

### `apps/mobile/src/assets/sample-fixtures.ts`

```typescript
// require() 경로는 번들러가 정적 분석하므로 변수 동적 생성 금지 (이유: Metro bundler static require).
// expo-asset 패키지 별도 import 금지 — expo 내장 Asset 은 task 09 에서 필요 시 사용.
// 본 파일은 순수 require() 참조만 제공한다.

export const SAMPLE_LULLABY = require('../../assets/samples/lullaby-sample.wav');
export const SAMPLE_VOICE   = require('../../assets/samples/voice-sample.wav');
```

- 타입: `number` (Metro bundler 가 `require()`에 모듈 ID 정수 반환)
- 경로 기준점: `apps/mobile/src/assets/sample-fixtures.ts` 위치에서 상대 경로

### `apps/mobile/assets/samples/` 파일 목록

| 파일명 | 형식 | 길이 | 출처 | 라이선스 |
|---|---|---|---|---|
| `lullaby-sample.wav` | WAV PCM 44100Hz 16-bit | 30~60초 | `apps/api/static/previews/brahms_preview.wav` 심볼릭 복사 (아래 참조) | Public Domain (브람스 자장가, 작곡가 사망 70년 이상 경과) |
| `voice-sample.wav` | WAV PCM 44100Hz 16-bit mono | 5~15초 | 아래 절차로 생성 | N/A (테스트 전용 합성 또는 직접 녹음) |
| `README.md` | Markdown | — | 직접 작성 | — |

---

## 핵심 로직 (파일 생성 절차)

engineer 가 아래 절차를 순서대로 실행한다. 실제 bash 커맨드이므로 그대로 실행하라.

### 1. 디렉토리 신설

```bash
mkdir -p apps/mobile/assets/samples
```

### 2. lullaby-sample.wav 생성

`apps/api/static/previews/brahms_preview.wav` 를 복사해 재사용한다.
복사 전 파일 크기 확인 후 **10MB 초과 시 ffmpeg 로 30초 구간만 잘라서** 복사한다.

```bash
# 파일 크기 확인
ls -lh apps/api/static/previews/brahms_preview.wav

# 크기 ≤ 10MB 인 경우 — 직접 복사
cp apps/api/static/previews/brahms_preview.wav \
   apps/mobile/assets/samples/lullaby-sample.wav

# 크기 > 10MB 인 경우 (stereo/고비트율 WAV) — ffmpeg 로 30초 트림
ffmpeg -i apps/api/static/previews/brahms_preview.wav \
       -t 30 -ar 44100 -ac 1 -sample_fmt s16 \
       apps/mobile/assets/samples/lullaby-sample.wav
```

### 3. voice-sample.wav 생성

실제 부모 목소리 녹음이 없으므로 **합성 음성 (sine wave + silence) 으로 더미 파일을 생성**한다.
ffmpeg 로 10초 dummy 생성:

```bash
# 10초 합성 voice sample (440Hz sine, mono, 44100Hz, 16-bit PCM)
ffmpeg -f lavfi -i "sine=frequency=440:duration=10" \
       -ar 44100 -ac 1 -sample_fmt s16 \
       apps/mobile/assets/samples/voice-sample.wav
```

> **주의**: 더미 sine wave 는 실제 목소리가 아니다. task 09 MinimalDspBridge 가 이 파일로 DSP chain 을 통과시켜 mp3 를 출력하는지 기능 검증 목적으로만 사용한다. 실제 UX 테스트 시 실녹음 교체 권장 (README에 명시).

### 4. README.md 작성

`apps/mobile/assets/samples/README.md` 내용은 아래 **주의사항 § README 내용** 참조.

### 5. sample-fixtures.ts 작성

상단 인터페이스 섹션의 내용 그대로 작성.

---

## 주의사항

1. **git commit 금지** — 본 task 는 파일 생성만. commit / push / PR 생성은 메인 Claude 가 수행한다.

2. **`require()` 경로 정적 선언 의무** — Metro bundler 는 `require(variable)` 동적 경로 미지원. 반드시 리터럴 문자열로 박아야 한다.

3. **10MB 상한 cap** — git-lfs 미설정 프로젝트이므로 파일당 10MB 초과 파일은 git history 오염 방지를 위해 ffmpeg 트림 후 박는다. 트림 후 크기도 확인하라 (`ls -lh`).

4. **`apps/api/` 코드 일체 수정 금지** — 이유: `brahms_preview.wav` 는 복사 대상이지 API 서버 코드가 아니다. `apps/api/static/previews/` 에서 단방향 복사만.

5. **`expo-asset` 별도 패키지 설치 금지** — `expo` 패키지 안에 이미 포함돼 있다. `package.json` 수정 없이 기존 `require()` 패턴 사용.

6. **README 내용 (아래 내용을 그대로 작성)**:

```markdown
# apps/mobile/assets/samples/

테스트 전용 오디오 fixture. Story 2 AC-1 검증 목적으로만 사용.

## 파일 목록

| 파일 | 출처 | 라이선스 |
|---|---|---|
| `lullaby-sample.wav` | `apps/api/static/previews/brahms_preview.wav` 복사 | Public Domain — 브람스 자장가 (Johannes Brahms, 1868). 작곡가 사망 70년 이상 경과. 편곡·연주 저작권은 본 프로젝트 자체 생성물. |
| `voice-sample.wav` | ffmpeg sine 합성 (440Hz 10s dummy) | N/A — 테스트 전용 합성 신호. 실제 녹음 아님. |

## 사용 의도

`apps/mobile/src/assets/sample-fixtures.ts` 통해 DSP module (task 09) 단위 테스트 입력으로 사용.
프로덕션 빌드에도 번들링되나, 앱 사용자는 본 파일 대신 실제 녹음 파일을 입력으로 사용한다.

## 실제 목소리 교체 방법

`apps/mobile/assets/samples/voice-sample.wav` 를 실제 부모 목소리 녹음 (10초 내외, 44100Hz 16-bit mono WAV) 으로 교체 후 DSP chain 재검증.
```

---

## DB 영향도

영향 없음. 본 task 는 mobile static asset 추가만이며 DB 스키마 변경 없음.

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | `apps/mobile/assets/samples/lullaby-sample.wav` 존재 + 크기 ≤ 10MB + WAV 헤더 정상 | (MANUAL) | `ls -lh apps/mobile/assets/samples/lullaby-sample.wav && ffprobe -v quiet -show_entries stream=duration,sample_rate -of default=noprint_wrappers=1 apps/mobile/assets/samples/lullaby-sample.wav` → duration ≥ 10 출력 |
| REQ-002 | `apps/mobile/assets/samples/voice-sample.wav` 존재 + 5~15초 + WAV 헤더 정상 | (MANUAL) | `ffprobe -v quiet -show_entries stream=duration -of default=noprint_wrappers=1 apps/mobile/assets/samples/voice-sample.wav` → duration 5 이상 15 이하 출력 |
| REQ-003 | `apps/mobile/assets/samples/README.md` 존재 + 라이선스 섹션 포함 | (MANUAL) | `grep -c "Public Domain" apps/mobile/assets/samples/README.md` → 1 이상 |
| REQ-004 | `apps/mobile/src/assets/sample-fixtures.ts` 존재 + SAMPLE_LULLABY / SAMPLE_VOICE 두 export 포함 | (TEST) | `grep -E "SAMPLE_LULLABY\|SAMPLE_VOICE" apps/mobile/src/assets/sample-fixtures.ts \| wc -l` → 2 |
| REQ-005 | `sample-fixtures.ts` 가 TypeScript 컴파일 통과 | (TEST) | `cd apps/mobile && npm run type-check 2>&1 \| grep -c sample-fixtures` → 0 (에러 없음) |
| REQ-006 | 총 추가 파일 사이즈 ≤ 20MB (lullaby + voice 합산) | (MANUAL) | `du -sh apps/mobile/assets/samples/*.wav` → 두 파일 합산 20MB 이하 확인 |

---

## 다른 모듈과의 경계

- **task 09 (`09-mobile-local-dsp-module.md`) 의존**: `sample-fixtures.ts` 의 두 export 를 `MinimalDspBridge` 단위 테스트 입력으로 사용한다. 본 task PASS 후 task 09 진입.
- **task 10 (`10-mobile-screens-hookup.md`)**: airplane mode E2E 시 동일 파일 사용 가능.
- **`apps/api/static/previews/`**: 단방향 복사 출처. API 서버 코드와 결합 없음.
