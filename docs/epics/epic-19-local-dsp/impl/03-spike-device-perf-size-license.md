---
depth: deep
story: 1
task_index: "3/3"
design: not-required
---

# 03 — spike-device-perf-size-license

**Epic 19 Story 1 · GO/NO_GO 게이트**

디바이스별 30초 입력 처리시간 (artifact #3) + ipa/apk 크기 델타 (artifact #4) + LGPL 라이선스 확정 (artifact #5) 를 실측 데이터로 확보하고 GO/NO_GO 판정을 내리는 task. 3 artifacts 모두 PASS 시에만 Story 2 (04, 05) + Story 3 (06) 진입. 1+ FAIL 시 04~06 폐기 + V2+ 이관 + epic 19 부분 종료.

---

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — Epic 19 가설 아키텍처 (§1 위협 모델 / §4 NFR / §5 리스크 / §8 impl 목차 GO/NO_GO 규칙)
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (spike 게이팅 판정 기준) / ADR-19D (spike-driven epic 패턴)
- `docs/m0-dsp-self-test.md` — 서버 기준 latency (0.94s cold) + 합격 ceiling 30s 출처
- 의존 task slug `01-spike-fork-eval` — engineer 가 `gh pr list --search "01-spike-fork-eval" --state merged --json url --jq '.[0].url'` 로 머지 PR 추적 후 read (working build + real device 설치 확인)
- 의존 task slug `02-spike-filter-probe` — 동일 방법으로 머지 PR 추적 후 read (4 필터 컴파일 증거 확인)

**전제 조건 gate**: 01 + 02 task 가 feature/local-dsp 브랜치에 머지되어 있어야 본 task 진입 가능. 미머지 시 진입 중단.

---

## Scope

**본 task 가 다루는 것 (real device 측정 전용)**:

- `apps/mobile/` 에서 직접 측정 스크립트 작성 + real device 실행
- 4 필터 chain 처리시간 측정 (artifact #3) — `performance.now()` 래핑
- ipa/apk 크기 비교 (artifact #4) — archive build before/after
- 라이선스 파일 read (artifact #5) — 변종명 + LICENSE 확인
- GO/NO_GO 판정 후 결과를 `docs/epics/epic-19-local-dsp/spike-results.md` 에 박음

**본 task 가 다루지 않는 것**:

- `LocalDspService` / `DspPipeline` / `FfmpegBridge` / `LocalCounterRepo` 모듈 구현 (04 scope)
- 화면 hook 교체 (05 scope)
- 서버 코드 변경 (06 scope)
- 시뮬레이터 측정 — 시뮬레이터 CPU/메모리 프로파일은 real device 와 2~10x 차이. real device 측정 의무 (아래 주의사항 참조)

---

## 인터페이스

### 측정 헬퍼 (apps/mobile/scripts/spike-perf-measure.ts)

```typescript
// 본 파일은 spike 전용 일회성 스크립트. 프로덕션 번들 포함 금지.
// 실행: npx ts-node apps/mobile/scripts/spike-perf-measure.ts <inputFilePath>

interface PerfResult {
  deviceLabel: string;      // 예: "Galaxy A53 Android 13" / "iPhone 12 iOS 17"
  inputDurationSec: number; // 30
  elapsedMs: number;        // performance.now() delta
  elapsedSec: number;       // elapsedMs / 1000
  passThreshold: boolean;   // elapsedSec <= 30
}
```

실제 ffmpeg 호출은 task 01 에서 검증된 `jdarshan5/ffmpeg-kit-react-native` (또는 fallback) 의 `FFmpegKit.executeAsync()` 를 그대로 사용. 새 래퍼 모듈 도입 금지 — 본 task 는 측정 전용.

### 측정 대상 ffmpeg 커맨드 (task 02 에서 검증된 4 필터 chain 동일)

```
-i <input.wav>
-af "afftdn=nr=10:nf=-25, equalizer=f=300:width_type=o:width=2:g=3, aecho=0.8:0.9:1000:0.3, acrossfade=d=0.3:c1=tri:c2=tri"
-b:a 128k <output.mp3>
```

`performance.now()` = `FFmpegKit.executeAsync()` 호출 직전 ~ `getReturnCode()` 반환 직후 구간 측정. 네트워크 I/O 0, 파일 I/O 만 포함.

---

## 핵심 로직

```
// artifact #3 측정 흐름
t0 = performance.now()
rc = await FFmpegKit.executeAsync(DSP_CMD_30S)
t1 = performance.now()
elapsed = (t1 - t0) / 1000  // seconds
pass = elapsed <= 30

// artifact #4 크기 비교
before_mb = du(ipa_before_path)  // archive build 전 baseline (01 task 에서 획득한 build)
after_mb  = du(ipa_after_path)   // ffmpeg-kit 라이브러리 포함 archive build
delta_mb  = after_mb - before_mb
pass4 = delta_mb <= 50

// artifact #5 라이선스
variant_name = package.json 의 ffmpeg-kit 의존 패키지명  // "-gpl" 포함 여부 확인
license_text = read(node_modules/<pkg>/LICENSE)
lgpl_confirmed = variant_name.includes("-gpl") === false
               && license_text.includes("GNU LESSER GENERAL PUBLIC LICENSE")
pass5 = lgpl_confirmed
```

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | 저사양 Android (Galaxy A 시리즈 2022 이후 — A33/A53/A54 등) 에서 30초 WAV 입력 → 4 필터 chain 처리시간 ≤ 30s | (MANUAL) real device | `spike-results.md` 에 `galaxy_a_elapsed_sec` ≤ 30 기록 + `passThreshold: true` |
| REQ-002 | 중간 사양 iPhone (12 또는 13) 에서 동일 조건 처리시간 ≤ 30s | (MANUAL) real device | `spike-results.md` 에 `iphone_elapsed_sec` ≤ 30 기록 + `passThreshold: true` |
| REQ-003 | 처리시간 측정에 사용된 WAV 입력 파일 길이 = 정확히 30초 (± 0.1s) 확인 | (MANUAL) | `ffprobe -v error -show_entries format=duration -of csv=p=0 <input.wav>` 출력 ∈ [29.9, 30.1] |
| REQ-004 | ipa/apk 크기 델타 ≤ 50MB (before = ffmpeg-kit 없는 baseline, after = ffmpeg-kit min 변종 포함) | (MANUAL) | `spike-results.md` 에 `ipa_delta_mb` + `apk_delta_mb` 기록. 둘 다 ≤ 50. `du -sh` 또는 `ls -lh` 출력 첨부 |
| REQ-005 | 채택 변종명에 `-gpl` 문자열 없음 + LICENSE 파일에 "GNU LESSER GENERAL PUBLIC LICENSE" 포함 확인 | (MANUAL) | `spike-results.md` 에 `variant_name`, `license_lgpl_confirmed: true` 기록. `grep -i "LESSER" node_modules/<pkg>/LICENSE` 출력 첨부 |

**통과 조건 커맨드 모음 (spike-results.md 작성 후 검증)**:

```bash
# REQ-001 / REQ-002: spike-results.md 에 값 기록 후 확인
cat docs/epics/epic-19-local-dsp/spike-results.md | grep -E "elapsed_sec|passThreshold"

# REQ-003: 입력 파일 길이 확인
ffprobe -v error -show_entries format=duration -of csv=p=0 <input.wav>

# REQ-004: ipa/apk 크기 확인
du -sh <ipa-before> <ipa-after>
# 또는 Xcode Archive → Distribute App → 크기 확인 (iOS Thinning Report)

# REQ-005: 라이선스 확인
grep -c "LESSER" node_modules/$(cat apps/mobile/package.json | python3 -c "import sys,json; d=json.load(sys.stdin)['dependencies']; [print(k) for k in d if 'ffmpeg' in k.lower()]")/LICENSE
# 출력이 1 이상이면 LGPL 확인
```

---

## GO/NO_GO 결정 표

| artifact | 판정 기준 | PASS | FAIL | 회색지대 |
|---|---|---|---|---|
| #3 처리시간 (Android) | elapsed ≤ 30s | GO 기여 | NO_GO | elapsed 30~60s → 사용자 결정 escalate (백그라운드 처리 + 진행률 UI Plan B 검토) |
| #3 처리시간 (iPhone) | elapsed ≤ 30s | GO 기여 | NO_GO | elapsed 30~60s → 사용자 결정 escalate |
| #4 크기 델타 | delta ≤ 50MB | GO 기여 | NO_GO | delta 50~80MB → 사용자 결정 escalate (ABI split / iOS thinning 완화 여부 검토) |
| #5 LGPL 라이선스 | `-gpl` 부재 + LGPL 명시 | GO 기여 | **즉시 NO_GO** (추가 검토 없음) | 해당 없음 — GPL = App Store 클로즈드 배포 위반. 회색 없음 |

**최종 판정**:

- **모두 PASS** → GO: 04~06 진입. `docs/epics/epic-19-local-dsp/spike-results.md` 에 `overall: GO` 기록 + `docs/epics/epic-19-local-dsp/architecture.md` §9 Spike Gate 결과 표 갱신
- **1+ FAIL** → NO_GO: 04~06 폐기. 아래 NO_GO 후속 절차 실행
- **회색지대 1+ 건** → ESCALATE: 본 impl 마지막 섹션 지시대로 사용자에게 보고

---

## NO_GO 후속 절차 (FAIL 확정 시 engineer 실행)

1. `docs/epics/epic-19-local-dsp/spike-results.md` 에 `overall: NO_GO` + FAIL artifact 상세 기록
2. `docs/epics/epic-19-local-dsp/architecture.md` §9 Spike Gate 결과 표 갱신 (`PENDING` → `FAIL`)
3. `docs/epics/epic-19-local-dsp/adr.md` ADR-19A 상태 `Proposed` → `Superseded` + 사유 1줄 (예: "artifact #4 크기 delta 105MB > 50MB, V2+ 재검토")
4. GitHub Story 2 이슈 (#264) + Story 3 이슈 (#265) 에 코멘트 박음: "Story 1 spike NO_GO — [artifact 명] FAIL. V2+ 이관 대기." (이슈 close 는 메인 Claude 가 수동 처리 — ADR-19E 정합)
5. V2+ backlog 항목 추가 — `backlog.md` 에 다음 줄 추가:
   ```
   - [ ] Epic 19 재진입 (V2+) — NO_GO 원인: [artifact #N] / 조건: [해소 조건 명시]
   ```
6. 메인 Claude (사용자) 에게 보고 후 epic 19 부분 종료. 04~06 impl 파일 작성 중단.

---

## ESCALATE (회색지대) 후속 절차

처리시간 30~60s 또는 크기 델타 50~80MB 결과 시 engineer 가 독자 판단 금지.

`docs/epics/epic-19-local-dsp/spike-results.md` 에 `overall: GRAY` + 측정값 박은 후 메인 Claude (사용자) 에게 다음 형식으로 보고:

```
ESCALATE — spike 회색지대 결과

artifact #N: [실측값] (기준: [합격선])
옵션 A: Plan B 적용 (처리시간 → 백그라운드 처리 + 진행률 UI 추가; 크기 → ABI split + iOS thinning)
옵션 B: NO_GO 처리 (04~06 폐기 + V2+ 이관)
권고: [engineer 권고 1줄 — 근거 포함]
```

---

## spike-results.md 형식 (artifact 기록용)

engineer 가 본 task 완료 시 아래 파일을 신규 생성:

**파일 경로**: `docs/epics/epic-19-local-dsp/spike-results.md`

```markdown
# Epic 19 — Spike Measurement Results

**측정일**: YYYY-MM-DD
**측정자**: [측정 엔지니어]
**브랜치**: feature/local-dsp
**라이브러리**: [채택 변종명]

## artifact #3 — 처리시간

| 디바이스 | 모델 | OS | elapsed_sec | passThreshold |
|---|---|---|---|---|
| Galaxy A (저사양 Android) | [모델명] | Android [버전] | [값] | true/false |
| iPhone (중간 사양) | [모델명] | iOS [버전] | [값] | true/false |

입력 파일 길이: [ffprobe 출력값]s

## artifact #4 — 앱 크기 델타

| 플랫폼 | before_mb | after_mb | delta_mb | passThreshold |
|---|---|---|---|---|
| iOS (ipa) | [값] | [값] | [값] | true/false |
| Android (apk) | [값] | [값] | [값] | true/false |

측정 방법: [du -sh / Xcode Archive / etc.]

## artifact #5 — LGPL 라이선스

| 항목 | 결과 |
|---|---|
| 변종명 | [패키지명] |
| `-gpl` 포함 | false (LGPL OK) / true (FAIL) |
| LICENSE LGPL 명시 | true / false |
| license_lgpl_confirmed | true / false |

## 최종 판정

**overall: GO / NO_GO / GRAY**

[판정 사유 1~3줄]
```

---

## DB 영향도

영향 없음. 본 task 는 측정 스크립트 실행 + 문서 기록 전용. DB 스키마 변경 0.

---

## 주의사항

1. **시뮬레이터 측정 금지. 이유**: iOS 시뮬레이터 CPU는 mac ARM 코어 그대로 실행 — 모바일 thermal throttling / cache 크기 / 메모리 bandwidth 미반영. Android 에뮬레이터는 x86 번역 레이어로 ARM 네이티브 대비 2~5x 느릴 수 있음. 둘 다 real device 측정값 대체 불가.
2. **full 변종 금지. 이유**: `jdarshan5` fork 의 full 변종 = 145MB+ (1건 보고 +105MB). `min` 또는 `https` 변종 사용. 변종명은 `package.json` 에 명시 (예: `jdarshan5/ffmpeg-kit-react-native#min`). full 설치 후 크기 측정하면 합격 기준 오판.
3. **30초 입력 파일 생성 방법**: `ffmpeg -f lavfi -i "sine=frequency=300:duration=30" -ar 44100 input_30s.wav` (서버 m0-dsp-self-test 와 동일 방식). 실 부모 음성 녹음 파일 사용 시 30.0s 정확히 trim 필요.
4. **LGPL 판정 자의적 해석 금지. 이유**: `-gpl` 변종명 부재 + LICENSE 파일 LGPL 명시 두 조건 동시 충족 시만 PASS. 변종명만 보고 판단하거나 LICENSE 파일 미확인 시 artifact #5 PASS 처리 금지. App Store 거부 시 epic 전체 재작업.
5. **측정 중 thermal throttling 고려**: Android Galaxy A 는 연속 ffmpeg 실행 시 thermal throttle 발동 가능. 디바이스 실온 (실내) + 측정 전 5분 대기 후 실행. 연속 3회 측정 후 중간값 채택.
6. **NO_GO 시 04~06 impl 파일 작성 시작 금지. 이유**: 가설 문서 (architecture.md 상단 명시) 기반 impl 파일이 확정 코드인 것처럼 취급되면 후속 엔지니어가 spike 결과 확인 없이 구현 진입하는 안티패턴 유발 (ADR-19D §트레이드오프).

---

## 다른 모듈과의 경계

- **task 01 (spike-fork-eval)** — working build + real device 설치 증거 의존. 01 PASS 없으면 본 task 진입 불가. 01 에서 설치된 라이브러리 그대로 사용 (재설치 X).
- **task 02 (spike-filter-probe)** — 4 필터 컴파일 증거 의존. 본 task 의 REQ-001~003 측정에 02 에서 확인된 필터 커맨드 문자열 그대로 사용.
- **task 04 (mobile-local-dsp-module)** — GO 판정 시에만 진입 허용. NO_GO 시 04~06 폐기.
- **메인 Claude (사용자)** — 회색지대 발생 시 ESCALATE 보고 의무. engineer 단독 판단 금지.

---

## 결과 보고 후 다음 단계

### GO 시

1. `spike-results.md` 에 `overall: GO` + 3 artifacts 측정값 기록
2. `architecture.md` §9 Spike Gate 결과 표 갱신:
   - `ffmpeg 4 필터 chain mobile 실행` → `PASS (artifact #1 + #2 + #3)`
   - `LGPL App Store 정합` → `PASS (artifact #5, LGPL 확정, 변종: [이름])`
3. `adr.md` ADR-19A 상태 `Proposed` → `Accepted` + 선정 라이브러리명 보강
4. 메인 Claude 에게 GO 판정 + spike-results.md 경로 보고
5. **architect-loop 호출 권장**: module-architect × 3 호출 → impl/04 + impl/05 + impl/06 각 1 파일

### NO_GO 시

위 "NO_GO 후속 절차" 섹션 순서대로 실행 후 메인 Claude 보고.
