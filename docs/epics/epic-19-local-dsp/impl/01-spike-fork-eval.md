---
depth: deep
story: Story 1
task_index: 1/3
slug: spike-fork-eval
epic: 19
github_issue: 263
branch_prefix: spike/epic19-task01-fork-eval
---

# task 01 — Local DSP spike: jdarshan5 fork build + iOS/Android real device 설치 (artifact #1)

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 프로젝트 아키텍처와 spike 맥락을 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1 라이브러리 후보 + §6 구현 순서 + §8 impl 목차
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (spike 게이팅 근거) + ADR-19D (spike-driven epic 패턴) + ADR-19E (통합 브랜치 패턴)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 scope + §참고 plan-reviewer PRE_CHECK 결과 인용
- `docs/ARCHITECTURE.md` — §음원 생성 시퀀스 (기존 서버 path 파악용)
- `apps/mobile/package.json` — 현재 RN / Expo 버전 확인 (Bare workflow 확인)

이전 task 없음 — 본 task 가 Story 1 첫 진입.

---

## Scope

**본 task 가 다루는 것**:
- `jdarshan5/ffmpeg-kit-react-native` fork 를 `apps/mobile` 에 npm install
- Expo Bare `npx expo prebuild` 통과 확인
- iOS real device 설치 + 첫 화면 진입 확인 (artifact #1 iOS 절반)
- Android real device 설치 + 첫 화면 진입 확인 (artifact #1 Android 절반)
- 빌드 로그 `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` 에 저장
- 결과 PASS/FAIL 기록 (분기 판단 포함)

**본 task 가 다루지 않는 것**:
- ffprobe -filters 출력 검증 (→ task 02 scope)
- 처리시간 / 앱 크기 / LGPL 측정 (→ task 03 scope)
- 모듈 구현 (`LocalDspService` 등) (→ Story 2 task 04 scope)
- 서버 코드 변경 0 — `apps/api/` 파일 일체 건드리지 마라

---

## 배경 — 왜 이 task 가 필요한가

plan-reviewer PRE_CHECK (2026-05-13) 는 다음을 확정 사실로 보고했다:

1. `ffmpeg-kit` 본가 (arthenica) 2025-01-06 retire, 2025-04-01 v6.0 바이너리 npm/CocoaPods/Maven 제거, 2025-06-23 GitHub repo 아카이브.
2. 2026 dev.to 가이드 = **Android 빌드 broken** (`Could not find com.arthenica:ffmpeg-kit-https:6.0-2`). 이 에러는 본가 Maven 아카이브 제거 결과.
3. `jdarshan5/ffmpeg-kit-react-native` fork — 단일 binary release (2025-04-08), Expo 문서 없음, semver 없음. **이 fork 가 본가 Maven 제거를 회피했는지 직접 검증 필요**.

따라서 본 task 는 **추측 없이 실제 빌드 + 설치** 로만 판단한다.

---

## 인터페이스 (설치 절차 + 확인 명령)

### 1단계 — fork 설치

```
# apps/mobile 에서
npm install github:jdarshan5/ffmpeg-kit-react-native
```

- `package.json` 에 `"ffmpeg-kit-react-native": "github:jdarshan5/ffmpeg-kit-react-native"` 추가 확인
- `node_modules/ffmpeg-kit-react-native/package.json` 의 `version` + `main` 필드 확인 후 `01-fork-build.log` 에 기록

### 2단계 — Expo Bare prebuild

```
npx expo prebuild --clean
```

- prebuild 완료 여부 확인 (exit 0)
- `ios/Podfile` 에 `ffmpeg-kit-react-native` pod 추가됐는지 grep 확인
- `android/build.gradle` 에 ffmpeg 관련 maven repo 추가됐는지 확인
- **핵심 검증**: Android `build.gradle` 또는 `settings.gradle` 에 `arthenica` maven 의존성이 본가 repo URL 을 가리키는지 확인. 가리키면 broken (dev.to 에러 재현). fork 가 자체 maven repo 또는 local aar 로 교체했는지 확인.

### 3단계 — iOS real device 빌드 + 설치

```
npx expo run:ios --device
```

- 사용 디바이스: 사용자 보유 iPhone (모델 명시 후 로그에 기록)
- 기대 결과: 설치 후 jajang 첫 화면 진입 (crash 없음)
- 빌드 로그 전체를 `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` 에 저장

### 4단계 — Android real device 빌드 + 설치

```
npx expo run:android --device
```

- 사용 디바이스: 사용자 보유 Android 디바이스 (모델 명시 후 로그에 기록)
- 기대 결과: 설치 후 jajang 첫 화면 진입 (crash 없음)
- 빌드 로그 `01-fork-build.log` 에 Android 섹션으로 append

---

## 핵심 로직 (fallback 분기)

```
if iOS build PASS AND Android build PASS:
    artifact #1 = PASS (primary fork 채택 확정)
    → task 02 진입

elif iOS or Android build FAIL (primary fork):
    log 에 에러 전문 + 에러 출처 (Gradle / CocoaPods / JS) 기록
    시도: fallback = kingjnr4/ffmpeg-expo (v0.0.1)
      npm install ffmpeg-expo@https://github.com/kingjnr4/ffmpeg-expo
      동일 prebuild + 양 플랫폼 빌드 재시도
    if fallback PASS:
        artifact #1 = PASS (fallback 채택, adr.md ADR-19A 보강 필요 → architect 재호출)
        → task 02 진입 (fallback 기반)
    else:
        artifact #1 = NO_GO
        → task 02, 03 skip. 03-spike-device-perf-size-license.md 에 NO_GO 기록
        → Story 2/3 폐기 또는 V2+ 이관 (architect + 사용자 판단)
```

자체 native module (3차 fallback) = 본 spike scope 외 (별 epic). primary + fallback 모두 FAIL 이면 NO_GO emit.

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | jdarshan5 fork npm install 성공 + Expo Bare prebuild exit 0 | (MANUAL) | `cd apps/mobile && npm install github:jdarshan5/ffmpeg-kit-react-native && npx expo prebuild --clean`  → exit code 0. `ios/Podfile` 에 `ffmpeg-kit` 관련 pod 1행 이상 존재: `grep -i ffmpeg ios/Podfile` 결과 비어있지 않음. |
| REQ-002 | iOS real device 설치 + 첫 화면 진입 (crash 없음) | (MANUAL) | `npx expo run:ios --device` → 디바이스에 앱 설치, 첫 화면 진입 (네이티브 crash 없음). 빌드 exit 0. `01-fork-build.log` 에 iOS 섹션 저장 완료. |
| REQ-003 | Android real device 설치 + 첫 화면 진입 (crash 없음) | (MANUAL) | `npx expo run:android --device` → 디바이스에 앱 설치, 첫 화면 진입 (crash 없음). 빌드 exit 0. `01-fork-build.log` 에 Android 섹션 저장 완료. |
| REQ-004 | Android Gradle 에서 본가 arthenica Maven repo 의존성 여부 확인 | (MANUAL) | `grep -r "arthenica" apps/mobile/android/` → 결과가 본가 URL (`https://github.com/arthenica/...` 또는 `https://dl.bintray.com/arthenica/...`) 을 가리키는 행이 있으면 FAIL (dev.to broken 에러 재현 가능성). fork 가 자체 배포 경로로 교체한 경우 = PASS. 결과를 `01-fork-build.log` 에 기록. |
| REQ-005 | 빌드 로그 저장 | (MANUAL) | `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` 파일 존재 + iOS 섹션 + Android 섹션 + 디바이스 모델 명시 포함. `ls -la docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` 파일 크기 > 0. |
| REQ-006 | PASS/FAIL 결과 기록 + 분기 명시 | (MANUAL) | `01-fork-build.log` 마지막 줄에 `RESULT: PASS (primary)` / `RESULT: PASS (fallback: kingjnr4)` / `RESULT: NO_GO` 중 하나 명시. primary FAIL 시 fallback 시도 여부 및 결과 명시. |

---

## 주의사항

1. **`MockFfmpegBridge` 등 목업으로 PASS 처리 금지**. 이유: ADR-19D + architecture.md §9 "Story 1 spike 3 task 모두 real-device 측정 의무" 명시 — mock 으로 PASS 처리하면 spike-driven epic 패턴 자체를 무효화한다.
2. **prebuild 시 `--clean` 플래그 의무**. 이유: 이전 native 캐시가 잔존하면 fork 설치 결과가 아닌 이전 바이너리 동작을 테스트하게 된다.
3. **서버 코드 (`apps/api/`) 일체 수정 금지**. 이유: ADR-19B — 서버 path 코드 보존 정책. 본 task 는 mobile Expo Bare 설치만 다룬다.
4. **Android 빌드 시 `arthenica` Maven URL 확인 의무 (REQ-004)**. 이유: plan-reviewer 가 2026-05-13 에 "dev.to 2026 가이드 = Android broken (`Could not find com.arthenica:ffmpeg-kit-https:6.0-2`)" 를 확정 사실로 보고. fork 가 이 에러를 회피했는지 확인 없이 진행하면 Android 설치 실패 원인 분석이 불가능해진다.
5. **fallback 시도 순서 엄수** — primary FAIL 시 바로 자체 native module 결론 금지. 이유: architecture.md §3.1 fallback 순서 = 1차(jdarshan5) → 2차(kingjnr4) → 3차(자체 native, 별 epic). 2차 시도 없이 NO_GO 처리는 spec 위반.
6. **engineer agent 가 git commit 하지 마라**. 이유: spike 산출물은 빌드 로그 파일만. `package.json` 변경 등은 PR 단위로 사용자 승인 후 커밋.

---

## 산출물 경로

| 파일 | 내용 |
|---|---|
| `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` | iOS + Android 빌드 로그 + 디바이스 모델 + arthenica Maven 확인 결과 + RESULT 한줄 |

---

## 후속 분기

| 결과 | 다음 행동 |
|---|---|
| `RESULT: PASS (primary)` | task 02 (`02-spike-filter-probe.md`) 진입. `package.json` fork 설치 상태 sub-PR 준비 |
| `RESULT: PASS (fallback: kingjnr4)` | architect 재호출 → ADR-19A 보강 (fallback 채택 기록). 이후 task 02 진입 |
| `RESULT: NO_GO` | task 02, 03 skip. architect + 사용자 보고. Story 2/3 폐기 또는 V2+ 이관 결정 위임. `docs/epics/epic-19-local-dsp/architecture.md` "상태: 가설" 유지 (ARCHITECTURE.md 본문 보강 하지 마라) |

---

## DB 영향도

영향 없음 — 본 task 는 npm 패키지 설치 + 네이티브 빌드 + 디바이스 설치만 수행한다. DB 스키마 / 마이그레이션 변경 0.
