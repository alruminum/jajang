---
depth: std
story: Story 1
task_index: "2/3"
slug: spike-filter-probe
epic: 19
github_issue: 263
branch_prefix: spike/epic19-task02-filter-probe
status: DEPRECATED
deprecated_reason: ffmpeg-kit fork 의존 전제가 task 01 spike NO_GO 로 무효화됨 (2026-05-13)
deprecated_replaces: impl/04-spike-ns1-afftdn-perceptual.md (예정), impl/05-spike-ns2-pure-js-perf.md (예정), impl/06-spike-ns3-rn-audio-api-integration.md (예정), impl/07-spike-ns4-candidate-comparison.md (예정)
---

> **⚠️ DEPRECATED (2026-05-13)** — 본 task 는 ffmpeg-kit fork 가 mobile 빌드 가능하다는 전제 위에 작성됨. Story 1 task 01 spike 결과 ffmpeg-kit fork 양쪽 broken 확정 ([spike-results/01-fork-build.log](../spike-results/01-fork-build.log)) → 본 task 진입 자체 불가능.
>
> Epic 19 framing 재정의 (port-implementation → port-requirement, 2026-05-13) 후 본 task 는 새 Spike NS1~NS4 ([architecture.md §3.1.C](../architecture.md#31c-새-spike-scope-framing-reset-후) + [adr.md ADR-19A](../adr.md#adr-19a-local-dsp-path-도입--후보-set-framing-재정의-진행-중)) 로 대체됨.
>
> 본 파일은 historical 보존 (framing reset 결정의 *전 상태* 추적용). 새 spike 진입 = module-architect 재호출 후 `impl/04~07-spike-ns*-*.md` 파일로 진행.

# task 02 — Local DSP spike: `ffprobe -filters` 출력으로 4 필터 컴파일 증거 확보 (artifact #2)  [DEPRECATED]

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 프로젝트 아키텍처와 spike 맥락을 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1 라이브러리 후보 + §6 구현 순서 + §8 impl 목차 + §9 Spike Gate
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (spike 게이팅 근거) + ADR-19D (spike-driven epic 패턴) + ADR-19E (통합 브랜치 패턴)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 scope + §참고 plan-reviewer PRE_CHECK 결과

이전 task 의존:
- task 01 (`01-spike-fork-eval.md`) PASS 가 본 task 진입 전제 — 사용된 fork (primary: jdarshan5 / fallback: kingjnr4) 를 `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` 에서 확인 후 진행.

```bash
# task 01 결과 확인
tail -5 docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log
```

`RESULT: PASS` 가 없으면 본 task 진입 금지 — architect + 사용자에게 NO_GO 보고.

---

## Scope

**본 task 가 다루는 것**:
- RN 앱 안에서 `FFmpegKitConfig.executeAsync("-filters")` (또는 fork 동등 API) 호출
- 호출 결과 stdout 전체를 app log (logcat / Xcode console) 에 출력
- log 를 `docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` 에 저장
- 4 필터 (`afftdn`, `equalizer`, `aecho`, `acrossfade`) grep 검증 + PASS/FAIL 결정

**본 task 가 다루지 않는 것**:
- 실제 DSP 처리 / 오디오 파일 I/O (→ task 03 scope)
- 처리시간 / 앱 크기 / LGPL 검증 (→ task 03 scope)
- `LocalDspService` 등 모듈 구현 (→ Story 2 task 04 scope)
- 서버 코드 (`apps/api/`) 일체 수정 금지

**플랫폼**: 본 task 는 logcat 출력만 필요하므로 **iOS simulator 또는 Android simulator 가능** (real device 불요). simulator 에서 PASS 이면 real device 동등 확인 불필요 (빌드 binary 동일).

---

## 배경 — 왜 이 task 가 필요한가

`afftdn` / `equalizer` / `aecho` / `acrossfade` 4 필터는 stock libavfilter 에 포함되어 외부 라이브러리 의존이 없다. 그러나 **prebuilt mobile binary 의 컴파일 옵션이 확정되지 않았다** — fork 빌드 스크립트가 `--disable-filters` 또는 축소 필터 세트를 지정했을 가능성이 0%가 아니다.

`min` 변종 등 경량 빌드는 기본 audio 필터 set 을 제한할 수 있다. 직접 측정 없이 "기본 포함" 을 가정하면 Story 2 구현 후 런타임에서 `No such filter 'afftdn'` 에러를 만날 수 있다.

따라서 본 task 는 **실제 바이너리에서 필터 목록을 출력**하여 4 필터 존재를 증거로 확보한다.

---

## 인터페이스 (호출 절차)

### API 선택 기준

task 01 에서 채택된 fork 에 따라 아래 중 하나를 사용한다:

| 채택 fork | 호출 API |
|---|---|
| `jdarshan5/ffmpeg-kit-react-native` | `FFmpegKitConfig.executeAsync("-filters")` — `ffmpeg-kit-react-native` 표준 API |
| `kingjnr4/ffmpeg-expo` | `FFmpegKit.execute("-filters")` 또는 fork 가 노출하는 동등 executeAsync — `node_modules/ffmpeg-expo/index.js` 에서 export 명 확인 후 사용 |

**중요**: API 명은 `node_modules/<package>/index.js` 또는 `index.d.ts` 를 직접 read 해서 확인하라. 추측 금지 (CLAUDE.md 제1 룰).

### 호출 코드 (임시 probe 스크린 또는 App.tsx 진입점)

```typescript
// 기존 화면을 수정하지 않는다.
// App.tsx 또는 임시 probe 컴포넌트에서 useEffect 로 1회 실행 후 결과 log 출력.
// 본 코드는 spike 전용 — Story 2 진입 시 제거.

import { FFmpegKit } from 'ffmpeg-kit-react-native'; // fork 실제 export 명으로 교체

useEffect(() => {
  FFmpegKit.execute('-filters').then(session => {
    session.getOutput().then(output => {
      console.log('[FILTER_PROBE_START]');
      console.log(output);
      console.log('[FILTER_PROBE_END]');
    });
  });
}, []);
```

**핵심 규칙**:
- `[FILTER_PROBE_START]` / `[FILTER_PROBE_END]` 마커를 반드시 출력해 log 캡처 범위를 명확히 한다.
- `console.log` 는 Metro bundler + logcat/Xcode console 양쪽에서 확인 가능 — 별도 native logging 불필요.
- 기존 화면 로직 (RecordModeScreen 등) 변경 금지 — 임시 probe 코드는 App.tsx `useEffect` 또는 별도 ProbeScreen 에만 격리.

### log 캡처 명령

```bash
# Android logcat (simulator 또는 real device)
adb logcat -s ReactNativeJS:V | grep -A 9999 'FILTER_PROBE_START' | head -500 > docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log

# iOS simulator (Xcode console 출력 또는 simctl)
xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.facebook.react"' 2>&1 | grep -A 9999 'FILTER_PROBE_START' | head -500 > docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log
```

`spike-results/` 디렉토리가 없으면 `mkdir -p docs/epics/epic-19-local-dsp/spike-results` 먼저 실행.

---

## 핵심 로직 (grep 검증 + 분기)

```
log = 02-filter-probe.log 내용

found = grep -c '<filter>' log 로 각 필터 존재 확인
필터 4개: afftdn, equalizer, aecho, acrossfade

if found(afftdn) AND found(equalizer) AND found(aecho) AND found(acrossfade):
    log 마지막 줄: RESULT: PASS (4/4 필터 확인)
    → task 03 진입

elif 한 개라도 missing:
    missing_list = [f for f in 4_filters if not found(f)]
    log 에 missing_list 기록
    시도: 빌드 변종 재선택
        - 현재 변종이 'min' → 'audio' 또는 'lts' 변종 재설치 후 재시도 (task 01 scope 이므로 architect 재호출 권고)
    if 재시도 불가 / 모든 변종 FAIL:
        log 마지막 줄: RESULT: NO_GO (missing: <list>)
        → task 03 skip. architect + 사용자에게 NO_GO 보고
        → Story 2/3 폐기 또는 V2+ 이관 결정 위임
```

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | RN 앱 안에서 ffmpeg `-filters` 명령 실행 (`executeAsync` 또는 동등 API) | (MANUAL) | 앱 실행 후 logcat 또는 Xcode console 에 `[FILTER_PROBE_START]` 마커 + 필터 목록 출력 확인. `adb logcat -s ReactNativeJS:V \| grep FILTER_PROBE_START` 결과 비어있지 않음. |
| REQ-002 | stdout 전체를 log 파일로 저장 | (MANUAL) | `ls -la docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` 파일 크기 > 0. `grep 'FILTER_PROBE_START' docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` 매치 1건 이상. |
| REQ-003 | `afftdn` 필터 존재 확인 | (MANUAL) | `grep -c 'afftdn' docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` → 결과 ≥ 1 |
| REQ-004 | `equalizer` 필터 존재 확인 | (MANUAL) | `grep -c 'equalizer' docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` → 결과 ≥ 1 |
| REQ-005 | `aecho` 필터 존재 확인 | (MANUAL) | `grep -c 'aecho' docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` → 결과 ≥ 1 |
| REQ-006 | `acrossfade` 필터 존재 확인 | (MANUAL) | `grep -c 'acrossfade' docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` → 결과 ≥ 1 |
| REQ-007 | 4 필터 일괄 grep 검증 스크립트 | (MANUAL) | `for f in afftdn equalizer aecho acrossfade; do echo "$f: $(grep -c $f docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log)"; done` → 4행 모두 `>= 1` |
| REQ-008 | PASS/FAIL 결과 기록 | (MANUAL) | `tail -3 docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` 에 `RESULT: PASS (4/4 필터 확인)` 또는 `RESULT: NO_GO (missing: <목록>)` 한 줄 포함. |

**4 필터 모두 PASS → 통과 조건 한 줄 확인용**:
```bash
for f in afftdn equalizer aecho acrossfade; do
  count=$(grep -c "$f" docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log)
  echo "$f: $count"
done
# 4행 모두 1 이상이면 PASS
```

---

## 주의사항

1. **`MockFfmpegKit` 또는 mock 출력으로 PASS 처리 금지**. 이유: ADR-19D + architecture.md §9 "Story 1 spike 3 task 모두 real-device 측정 의무" — mock 으로 PASS 처리하면 spike-driven epic 패턴 자체를 무효화한다.
2. **API 명 추측 금지**. 이유: fork 마다 export 명이 다를 수 있다. `node_modules/<package>/index.js` 또는 `index.d.ts` 를 직접 Read 해서 export 명 확인 후 호출하라.
3. **기존 화면 로직 수정 금지**. 이유: probe 코드는 spike 전용 임시 코드다. `RecordModeScreen.tsx` 등 기존 파일 수정 시 task 03 이후 revert 비용 발생. App.tsx `useEffect` 격리 또는 별도 ProbeScreen 사용.
4. **task 01 PASS 확인 없이 진입 금지**. 이유: fork 설치 자체가 FAIL 이면 `-filters` 명령 실행 자체가 불가능하다. `01-fork-build.log` 의 `RESULT: PASS` 확인 후 진입.
5. **`min` 변종에서 필터 missing 발생 시 직접 NO_GO 처리 금지**. 이유: `min` 변종은 축소 binary 다. `audio` 또는 `lts` 변종으로 교체 후 재시도가 ADR-19A 에서 허용된 분기다. 단, 변종 교체 = task 01 scope 이므로 architect 재호출 후 진행.
6. **서버 코드 (`apps/api/`) 일체 수정 금지**. 이유: ADR-19B — 서버 path 코드 보존 정책. 본 task 는 mobile 앱 log 캡처만 수행한다.
7. **engineer agent 가 git commit 하지 마라**. 이유: 산출물은 log 파일 + probe 코드 임시 추가만. PR 단위로 사용자 승인 후 커밋.

---

## 산출물 경로

| 파일 | 내용 |
|---|---|
| `docs/epics/epic-19-local-dsp/spike-results/02-filter-probe.log` | `-filters` 출력 전문 (FILTER_PROBE_START~END 마커 포함) + grep 검증 결과 4행 + `RESULT:` 한 줄 |

---

## 후속 분기

| 결과 | 다음 행동 |
|---|---|
| `RESULT: PASS (4/4 필터 확인)` | task 03 (`03-spike-device-perf-size-license.md`) 진입 |
| `RESULT: NO_GO (missing: <목록>)` — 변종 교체 재시도 가능 | architect 재호출 → ADR-19A `빌드 변종` 항목 갱신 후 task 01 재진입 (변종 교체 = task 01 scope). 재시도 후 본 task 재실행 |
| `RESULT: NO_GO (missing: <목록>)` — 모든 변종 FAIL 영구 | task 03 skip. architect + 사용자에게 NO_GO 보고. Story 2/3 폐기 또는 V2+ 이관 결정 위임. `docs/epics/epic-19-local-dsp/architecture.md` "상태: 가설" 유지 (ARCHITECTURE.md 본문 보강 하지 마라) |

---

## DB 영향도

영향 없음 — 본 task 는 RN 앱 안에서 ffmpeg API 호출 결과를 log 파일로 저장하는 것만 수행한다. DB 스키마 / 마이그레이션 변경 0.
