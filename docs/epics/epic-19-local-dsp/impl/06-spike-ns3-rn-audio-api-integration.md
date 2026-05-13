---
depth: std
story: Story 1
task_index: 3/4
slug: spike-ns3-rn-audio-api-integration
epic: 19
github_issue: 263
branch_prefix: feature/epic19_story1_ns3_rn_audio_api_integration
---

# task 06 — NS3: `react-native-audio-api` Expo Bare 통합 spike (C2 후보 viability)

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 프로젝트 아키텍처와 spike 맥락을 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1.A 효과-후보 매트릭스 + §3.1.B C2 후보 정의 + §3.1.C NS3 PASS 조건 + §9.2 새 Spike Gate 상태
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (후보 set 재정의 + C2 트레이드오프) + ADR-19D (spike-driven epic 패턴) + ADR-19E (통합 브랜치 패턴)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 NS3 행 + NO_GO 분기 정의
- `docs/epics/epic-19-local-dsp/impl/01-spike-fork-eval.md` — COMPLETED / NO_GO task. 동일 `npx expo run:android` 빌드 절차 reference. ffmpeg-kit 잔존 dep 확인 항목 참조
- `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` — Galaxy S24+ 빌드 절차 실측 기록 (디바이스 연결 확인 명령 + `npx expo run:android` 패턴)
- `apps/mobile/package.json` — 현재 RN 0.83.6 + Expo 55 Bare workflow 버전 확인

의존 task 상태 (NS1~NS3 직렬 — 단 본 task 는 NS1/NS2 와 독립):

- NS1 (impl/04) — PENDING 독립. 본 NS3 는 NS1 결과에 의존하지 않는다 (별도 후보 viability).
- NS2 (impl/05) — PENDING 독립. 마찬가지.
- **NS3 (본 task)** — NS1/NS2 와 독립 실행 가능. NS4 진입 전 필수.

---

## Scope

**본 task 가 다루는 것**:

- `react-native-audio-api` (Software Mansion) 최신 버전 npm install → Expo Bare RN 0.83.6 / Expo 55 환경 설치 확인
- `npx expo prebuild --clean` → iOS Podfile.lock + Android settings.gradle 에 라이브러리 autolink 검증
- **임시 probe 코드** (`apps/mobile/src/spike/RnAudioApiProbeScreen.tsx`) 작성 — 1-tap button → AudioContext → DelayNode echo demo
- `npx expo run:android` → Galaxy S24+ (or 보유 Android device) 실 빌드 + 설치
- logcat / 화면 동작으로 echo demo 동작 확인 (에러 0)
- **MP3 export 지원 여부** 추가 검증 — `node_modules/react-native-audio-api/dist/index.d.ts` 직접 read 후 기록
- 결과 로그 `spike-results/06-ns3-rn-audio-api-integration.log` 저장 + RESULT 한줄 기록

**본 task 가 다루지 않는 것**:

- 기존 화면 (`RecordModeScreen` 등) 수정 — probe 코드는 별도 파일로 완전 분리
- NS1 / NS2 측정 — 본 task scope 외
- NS4 perceptual quality 비교 — NS1~NS3 결과 후 진입
- 서버 코드 (`apps/api/`) 일체 수정 0
- Story 2 모듈 구현 (`LocalDspService` 등) — spike PASS 후 진입

---

## 배경 — 왜 이 task 가 필요한가

architecture.md §3.1.B C2 후보 정의:

> **C2** | `react-native-audio-api` 합성 + JS afftdn | EQ/echo/crossfade = RN-audio-api node graph / afftdn = JS `fft.js` | RN-audio-api dep 1개. node graph 구성 | < 5s (RN-audio-api native 가속 + afftdn 만 JS) | **RN-audio-api Expo Bare 통합 검증 의무 (별도 sub-spike)**

plan-reviewer PRE_CHECK (stories.md §참고) 가 "MP3 export 미확인" 를 C2 리스크로 명시했다. 본 task 는 install + prebuild + 빌드 + demo 동작 + MP3 export 지원 여부까지 측정하여 NS4 에 전달한다.

task 01 (COMPLETED, NO_GO) 과 동일한 `npx expo run:android` 패턴을 사용하되, ffmpeg-kit 잔존 dep 이 있으면 먼저 cleanup 한다.

---

## 인터페이스

### 1단계 — 사전 cleanup (ffmpeg-kit 잔존 dep 제거)

```
# apps/mobile 에서
grep "ffmpeg" package.json
```

- `ffmpeg-kit-react-native` 또는 `ffmpeg-expo-monorepo` 등 task 01 잔존 항목 있으면:
  ```
  npm uninstall ffmpeg-kit-react-native
  npm uninstall expo-ffmpeg-monorepo
  ```
- 이후 `node_modules/` 에 ffmpeg 관련 디렉토리 잔재 없음 확인: `ls node_modules/ | grep -i ffmpeg` → 0 결과

### 2단계 — `react-native-audio-api` install + version 확인

```
# apps/mobile 에서
npm view react-native-audio-api version   ← 측정 시점 latest version 박음 (추측 금지)
npm install react-native-audio-api
```

- `package.json` 에 추가된 버전 명시 (예: `"react-native-audio-api": "^0.12.2"`)
- `node_modules/react-native-audio-api/package.json` 의 `version` 필드 확인 후 로그에 기록

### 3단계 — MP3 export 지원 여부 사전 검증 (추측 금지)

```
# node_modules 설치 후 .d.ts 직접 read
cat node_modules/react-native-audio-api/dist/index.d.ts
# 또는 (경로가 다를 경우 실제 경로 확인 후 read)
find node_modules/react-native-audio-api -name "*.d.ts" | head -5
```

검증 포인트:

- `MediaRecorder` / `AudioEncoder` / `encodeAudio` / `exportToMP3` 또는 유사 MP3 encode 관련 타입 존재 여부
- WAV / PCM export 관련 타입 존재 여부
- 결과를 로그에 기록: `MP3_EXPORT: supported / WAV_only / not_found`

**중요**: API 명 추측 금지. `.d.ts` 또는 `README.md` (`node_modules/react-native-audio-api/README.md`) 에서 확인한 실제 API 명만 사용한다.

### 4단계 — Expo prebuild + autolink 검증

```
cd apps/mobile
npx expo prebuild --clean
```

- exit code 0 확인
- iOS Podfile.lock 에 `react-native-audio-api` 관련 pod 존재 확인:
  ```
  grep -i "audio-api" ios/Podfile.lock
  ```
- Android settings.gradle 또는 android/app/build.gradle 에 autolink 확인:
  ```
  grep -i "audio-api\|audio_api\|AudioApi" android/settings.gradle android/app/build.gradle
  ```
- 결과 (pod 행 수 + gradle 행 수) 로그에 기록

### 5단계 — probe 코드 작성

파일: `apps/mobile/src/spike/RnAudioApiProbeScreen.tsx`

**API 명은 3단계에서 확인한 실제 .d.ts 기반으로 작성한다.** 아래는 구조 스켈레톤이고, 실제 API 명 + 타입은 `.d.ts` 확인 후 채운다:

```
역할: 1-tap button → AudioContext 생성 → OscillatorNode or MediaStreamSource (마이크)
      → DelayNode (1000ms, decay 0.3) → AudioDestination (speaker)
      → 5초 후 자동 stop

위치: apps/mobile/src/spike/ (spike 전용 디렉토리, 기존 화면 의존 0)
기존 앱 라우팅에 등록하지 않는다 (App.tsx 또는 Navigator 수정 금지)
```

probe 진입 방법은 두 가지 중 하나 선택:
- (A) App.tsx 최상단에 `if (__DEV__) return <RnAudioApiProbeScreen />` 조건 분기 (DEV mode 전용, 기존 화면 영향 0)
- (B) `npx expo run:android` 실행 후 Metro bundler 에서 직접 import 변경 (코드 변경 최소)

어느 방법이든 **기존 화면 (RecordModeScreen 등) 코드 파일 수정 0** 원칙 지킨다.

### 6단계 — Galaxy device 빌드 + 설치 + logcat

```
# device 연결 확인
adb devices -l
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release

# 빌드 + 설치
cd apps/mobile
npx expo run:android

# 별도 터미널 — logcat 캡처
adb logcat -s ReactNativeJS,RNAudioAPI | tee /tmp/ns3-logcat.txt
```

- 빌드 exit code 0 확인
- 앱 설치 후 probe 화면 진입 + 1-tap 버튼 실행
- logcat 에서 AudioContext 생성 성공 메시지 + 에러 0 확인
- echo 소리 실제 출력 여부 확인 (마이크 권한 요청 + speaker 출력)
- logcat 관련 부분 (`/tmp/ns3-logcat.txt`) 을 `spike-results/06-ns3-rn-audio-api-integration.log` 에 append

---

## 핵심 로직 (분기)

```
cleanup ffmpeg-kit 잔존 dep (있으면)
install react-native-audio-api → version 확인
read .d.ts → MP3_EXPORT 상태 기록
npx expo prebuild --clean → exit 0?
  FAIL → REQ-002 FAIL → RESULT: C2 NO_GO (prebuild)
autolink grep → audio-api pod + gradle 행 있음?
  0 매치 → REQ-003 FAIL → RESULT: C2 NO_GO (autolink)
probe 코드 작성 (실제 .d.ts API 기반)
npx expo run:android → exit 0?
  FAIL → REQ-005 FAIL → RESULT: C2 partial (install OK / 빌드 FAIL)
  PASS → probe 화면 진입 + 1-tap echo demo 동작?
    FAIL → RESULT: C2 partial (빌드 OK / demo FAIL)
    PASS → RESULT: C2 viable (install OK + prebuild OK + Galaxy 빌드 OK + 1-tap demo OK)
           + MP3_EXPORT 상태 NS4 비교 표에 반영
```

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | `react-native-audio-api` npm install exit 0 + 측정 시점 버전 명시 | (MANUAL) | `cd apps/mobile && npm view react-native-audio-api version` → version 출력 확인 후 로그 기록. `npm install react-native-audio-api` exit 0. `node_modules/react-native-audio-api/package.json` 의 `version` 필드 로그에 기록. |
| REQ-002 | `npx expo prebuild --clean` exit 0 | (MANUAL) | `cd apps/mobile && npx expo prebuild --clean` exit 0. 명령 실행 결과 (exit code + 마지막 10행) 를 `06-ns3-rn-audio-api-integration.log` 에 기록. |
| REQ-003 | iOS Podfile.lock + Android settings.gradle 에 `react-native-audio-api` autolink 확인 | (MANUAL) | `grep -i "audio-api" ios/Podfile.lock` → 1행 이상 출력. `grep -i "audio.api\|AudioApi" android/settings.gradle` → 1행 이상 출력 (대소문자 변종 포함). 두 결과를 로그에 기록. |
| REQ-004 | Galaxy Android 디바이스 모델 + Android OS 버전 명시 | (MANUAL) | `adb shell getprop ro.product.model` + `adb shell getprop ro.build.version.release` 출력을 로그에 기록. 디바이스 부재 시 사용 가능한 Android 에뮬레이터 스펙 명시 + `DEVICE: emulator` 표기. |
| REQ-005 | `npx expo run:android` 빌드 exit 0 + APK 설치 성공 | (MANUAL) | `npx expo run:android` exit 0. logcat 에서 `Displayed com.jajang.app` 행 또는 설치 성공 메시지 확인. 에러 라인 0 (`E ReactNativeJS` / `E RNAudioAPI` 계열 0). |
| REQ-006 | 1-tap echo demo 동작 확인 (logcat + 청각 확인) | (MANUAL) | probe 화면 진입 + 버튼 1회 탭 → AudioContext 생성 / DelayNode 연결 성공 로그 확인. 마이크 → 스피커 echo (≈1초 delay) 청각 확인 또는 logcat 에서 에러 없는 노드 그래프 실행 흔적 확인. 해당 logcat 발췌를 로그에 기록. |
| REQ-007 | MP3 export 지원 여부 `.d.ts` 직접 확인 후 기록 | (MANUAL) | `node_modules/react-native-audio-api/dist/index.d.ts` (또는 실제 경로) 직접 read. `MP3_EXPORT: supported \| WAV_only \| not_found` 한줄로 로그에 기록. 미지원 시 NS4 비교 표에 `-1 점수` 반영 명시. |
| REQ-008 | RESULT 한줄 로그 마지막 행 기록 | (MANUAL) | `06-ns3-rn-audio-api-integration.log` 마지막 행 = `RESULT: C2 viable (install OK + prebuild OK + Galaxy 빌드 OK + 1-tap demo OK)` 또는 `RESULT: C2 partial (install OK / 빌드 FAIL)` 또는 `RESULT: C2 NO_GO (install FAIL or 빌드 FAIL or demo FAIL)` 중 하나. |

---

## 주의사항

1. **ffmpeg-kit 잔존 dep cleanup 의무**. 이유: task 01 이 `ffmpeg-kit-react-native` 와 `expo-ffmpeg-monorepo` 를 설치하고 `npm uninstall` 로 정리했으나 `package.json` 에 잔존 항목이 있을 수 있다. `grep "ffmpeg" apps/mobile/package.json` 으로 확인 후 잔존 시 `npm uninstall` 먼저 실행하라. 잔존 채로 prebuild 하면 이전 fork 의 broken native dep 이 혼입된다.

2. **`react-native-audio-api` API 명 추측 금지**. 이유: plan-reviewer PRE_CHECK (stories.md §참고) 가 "MP3 export 미확인" 를 명시했다. `AudioContext` / `DelayNode` 등 Web Audio API 명칭이 그대로 노출되는지 `.d.ts` 에서 직접 확인 후 probe 코드를 작성하라. 추측으로 작성하면 컴파일 에러 = 빌드 FAIL 로 이어진다.

3. **임시 probe 코드는 spike 전용 — 기존 화면 수정 0**. 이유: spike 코드가 기존 화면에 침투하면 NS4 이후 cleanup 비용이 증가하고, 기존 화면 regression 위험이 생긴다. `apps/mobile/src/spike/` 디렉토리에만 위치시키고, 기존 `Navigator` 라우팅에 등록하지 마라. DEV mode 조건 분기 (`__DEV__`) 로만 진입.

4. **engineer agent 가 git commit 하지 마라**. 이유: spike 산출물은 log 파일 + probe 코드. `package.json` 변경 (react-native-audio-api 추가) 은 PR 단위로 사용자 승인 후 커밋한다.

5. **Galaxy S24+ (고사양) 빌드 PASS = 저사양 빌드 PASS 추정 OK**. 이유: NS3 는 빌드/통합 검증이 목적이고, 성능 측정이 아니다 (성능 측정은 NS2 scope). NS2 와 달리 저사양 Android 의무 없음. 보유 Android 디바이스 모델을 로그에 명시하면 충분.

6. **MP3 export 미지원 시 NO_GO 로 판정하지 말고 NS4 비교 표에 반영**. 이유: C2 후보가 WAV 만 지원해도 C1/C3 와의 perceptual diff 비교 (NS4) 가 여전히 유효하다. 단 MP3 export 를 위해 추가 bridge 모듈이 필요한 경우 = "C2 후보 점수 -1" 을 NS4 비교 메모에 박아라.

7. **prebuild 시 `--clean` 플래그 의무**. 이유: task 01 에서 동일. 이전 ffmpeg-kit native 캐시가 잔존하면 react-native-audio-api autolink 결과가 정확하지 않다.

---

## 산출물 경로

| 파일 | 내용 |
|---|---|
| `apps/mobile/src/spike/RnAudioApiProbeScreen.tsx` | 1-tap echo demo probe 코드 (spike 전용, NS4 진입 시 제거) |
| `docs/epics/epic-19-local-dsp/spike-results/06-ns3-rn-audio-api-integration.log` | install version + prebuild 결과 + autolink grep 출력 + device 모델 + 빌드 exit code + logcat 발췌 + MP3_EXPORT 상태 + RESULT 한줄 |

---

## 후속 분기

| RESULT | 다음 행동 |
|---|---|
| `C2 viable` | NS4 진입. C2 후보 = NS4 비교 대상에 포함. MP3_EXPORT 상태 NS4 비교 표에 기록 |
| `C2 NO_GO` | C2 폐기. NS4 진입 시 C1 + (NS1 결과) C3 만 후보. architect 에게 C2 NO_GO 사실 보고 필요 없음 — log 파일로 NS4 진입 시 자동 인지 |
| `C2 partial` | ESCALATE — 사용자에게 부분 viability 보고. 예: install 성공 + prebuild 성공 + 빌드 FAIL = 추가 분석 필요 (RN 버전 호환 이슈 / pod 설치 실패 등). 추측으로 해결 시도하지 말고 에러 전문을 로그에 기록 후 사용자 판단 위임 |

---

## DB 영향도

영향 없음 — npm 패키지 설치 + Expo prebuild + 네이티브 빌드 + probe 코드 실행만 수행한다. DB 스키마 / 마이그레이션 / 서버 코드 변경 0.
