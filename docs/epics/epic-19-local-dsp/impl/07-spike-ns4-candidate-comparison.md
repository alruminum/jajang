---
depth: deep
design: not-required
story: 1
task_index: 4/4
---

# 07 spike-ns4-candidate-comparison

**Epic 19 Story 1 — NS4 최종 후보 비교 + 채택 결정 게이트**

NS1~NS3 spike 결과로 viability 가 확정된 후보들 (C1/C2/C3) 을 동일 입력 데이터로 나란히 실행한 뒤, waveform diff + spectral 분석 + SNR 계산 + 사용자 blind listening test 를 통해 **채택 후보 1개를 결정**한다. 이 결정이 Story 2 구현 진입 여부와 방향을 확정한다.

> **C4 (afftdn-only 자체 native module) 는 본 NS4 scope 외.** C4 는 별도 epic 규모 작업이고, NS1~NS3 viable 후보 0개 시 사용자가 별 epic 진입 결정. 본 NS4 에서 C4 를 측정 대상으로 넣지 않는다.

---

## 사전 준비 (먼저 read 필수)

아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1.B 통합 후보 C1~C3 정의 + §3.1.C NS4 역할 + §9.2 Spike Gate 표
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (후보 set 정의 + 채택 기준 철학)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 NS4 행 + Epic 완료 기준
- `docs/m0-dsp-self-test.md` — 서버 baseline: SNR 21.64 dB / 합격선 ≥15 dB / 입력 규격 (30s synthetic voice + white noise -25dBFS)

의존 spike PR 머지 확인 (세 건 모두 머지된 후에 진입할 것):

```bash
# NS1 (C3 viability — afftdn 강등 perceptual diff)
gh pr list --search "04-spike-ns1" --state merged --json url --jq '.[0].url'

# NS2 (C1 viability — pure-JS DSP 처리시간)
gh pr list --search "05-spike-ns2" --state merged --json url --jq '.[0].url'

# NS3 (C2 viability — react-native-audio-api Expo Bare 통합)
gh pr list --search "06-spike-ns3" --state merged --json url --jq '.[0].url'
```

**위 세 URL 중 하나라도 결과 없으면 즉시 작업 중단 → 사용자 또는 architect 에게 NS1~NS3 진행 요청 (ESCALATE).**

의존 결과 파일 read:

```bash
cat docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log
cat docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
cat docs/epics/epic-19-local-dsp/spike-results/06-ns3-rn-audio-api-integration.log
```

각 log 파일에서 `RESULT: viable` / `RESULT: not-viable` 라인을 추출해 viable 후보 목록을 확정한 뒤 진행한다.

---

## Scope

**본 task 가 다루는 것:**

- `apps/mobile/scripts/spike-ns4-candidate-comparison.ts` — viable 후보들의 DSP 출력 mp3/wav 생성 + waveform/spectral plot 스크립트
- `docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-comparison.log` — 측정 수치 (SNR / dep count delta / size delta / runtime) 기록
- `docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-waveform.png` — 4-trace waveform overlay (각 후보 + server baseline)
- `docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-spectral.png` — FFT spectral heatmap 4개 side-by-side

**본 task 가 건드리지 않는 것:**

- `apps/mobile/src/` — Story 2 구현 영역. 본 spike 에서 일절 변경 금지
- `apps/api/` — 서버 path 보존. 변경 금지
- `docs/ARCHITECTURE.md` / `docs/ADR.md` — Spike Gate PASS 후 별도 sub-PR (architecture.md §9.2 정책)
- C4 (afftdn-only 자체 native) — 별 epic 영역, 본 NS4 측정 대상 아님

---

## 인터페이스

### 측정 스크립트 시그니처

```typescript
// apps/mobile/scripts/spike-ns4-candidate-comparison.ts

interface CandidateResult {
  id: 'C1' | 'C2' | 'C3';
  viable: boolean;           // NS1~NS3 log 에서 읽은 값
  outputPath: string | null; // 30s 처리 후 출력 파일 경로 (viable=false 시 null)
  snrDiffDb: number | null;  // server baseline 대비 SNR 차이 (양수 = 더 좋음)
  depCountDelta: number;     // npm install +N 패키지 수
  sizeDeltaMb: number;       // 앱 크기 증가 추정 (MB)
  runtimeMs: number | null;  // 30s 입력 처리 실측 ms (viable=false 시 null)
}

interface ComparisonReport {
  inputPath: string;          // m0-self-test 동일 30s 입력 파일 경로
  serverBaselinePath: string; // m0-self-test 서버 출력 경로 (SNR baseline)
  serverBaselineSnrDb: number; // 21.64 (m0-self-test 실측값)
  candidates: CandidateResult[];
  adopted: 'C1' | 'C2' | 'C3' | 'NO_GO';
  adoptedReason: string;
}

// 진입점
async function runComparison(): Promise<ComparisonReport>
```

### 핵심 불변 규칙 (deep depth 보안·무결성 invariant)

1. **입력 bit-identical 의무** — `inputPath` 파일은 NS1 spike (`04-spike-ns1-afftdn-perceptual.ts`) 가 사용한 입력 파일과 동일해야 한다. 재생성 금지. SHA-256 체크섬을 log 첫 줄에 기록한다.
2. **mock 출력 금지** — 각 후보의 `outputPath` 파일은 해당 후보의 실제 DSP 처리 결과여야 한다. `fs.copyFile` / 더미 생성 등 우회 금지.
3. **사용자 blind listening test 우회 금지** — `adopted` 필드는 SNR 자동 계산 결과 + 사용자 주관 청취 이후에만 기록한다. 스크립트가 자동으로 `adopted` 를 결정하도록 작성하면 안 된다. 스크립트는 수치를 출력하고 종료, `ADOPTED` 라인은 사용자가 청취 후 log 파일에 수동으로 추가한다.
4. **viable=false 후보 출력 생성 금지** — NS1~NS3 log 에서 `not-viable` 로 판정된 후보의 DSP 코드를 실행하지 않는다. log 에 `SKIPPED: not-viable (NSx 결과)` 라인만 기록한다.
5. **engineer 가 git commit 금지** — 스크립트 실행 + 결과 파일 생성 후 `git commit` 하지 않는다. PR 은 사용자 확인 후 별도로 올린다.

---

## 핵심 로직

```
1. viable_list = [C 에서 NSx log "RESULT: viable" 인 것들]
   if len(viable_list) == 0: log "RESULT: NO_GO", exit

2. input_sha = sha256(inputPath)
   log "INPUT_SHA256: {input_sha}"
   assert input_sha == ns1_input_sha  // NS1 log 에서 추출한 값과 대조

3. for each C in viable_list:
     output = run_dsp_for_candidate(C, inputPath)   // 후보별 DSP 실행
     snr = compute_snr(output, serverBaseline)       // ffmpeg astats 또는 librosa
     runtime_ms = measure_runtime(C, inputPath)      // performance.now() 또는 time.perf_counter()
     save output to spike-results/07-ns4-{C}-output.{ext}
     log line: "C={C} SNR={snr}dB RUNTIME={runtime_ms}ms DEP={depDelta} SIZE={sizeDelta}MB"

4. generate_waveform_overlay(viable_outputs + serverBaseline) → 07-ns4-candidate-waveform.png
   generate_spectral_heatmap(viable_outputs + serverBaseline) → 07-ns4-candidate-spectral.png

5. print 채택 결정 표 (수치만, ADOPTED 라인 미포함)
   print "=== 사용자 청취 후 아래 라인을 log 에 수동 추가 ==="
   print "RESULT: ADOPTED = C? (사유: ...)"  // 예시 형식
```

---

## 후보별 DSP 구현 지침

### C1 — pure-JS DSP (viable 시 NS2 스크립트 재사용)

```typescript
// NS2 spike 에서 작성된 측정 스크립트 경로를 먼저 확인:
// docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log 에서
// "SCRIPT:" 라인을 읽어 스크립트 파일 경로 확인 후 재사용

// 출력: apps/mobile/scripts/spike-results/07-ns4-C1-output.wav
// 적용 DSP: fft.js (afftdn) + biquad EQ (300Hz +3dB) + delay echo (1000ms/0.3) + triangular gain ramp crossfade
```

### C2 — react-native-audio-api 합성 (viable 시 NS3 probe 코드 확장)

```typescript
// NS3 spike 에서 작성된 probe 코드를 확장하여 30s 입력 → 4 효과 → 출력 파일 생성
// NS3 log "PROBE_SCRIPT:" 라인으로 경로 확인
// C2 = EQ/echo/crossfade = react-native-audio-api node graph, afftdn = fft.js
// 출력: apps/mobile/scripts/spike-results/07-ns4-C2-output.wav
// 주의: RN 환경에서만 node graph 동작 → 출력 생성을 위해 device 또는 simulator 필요
//       불가 시 log 에 "C2 SKIPPED: requires RN runtime (no headless mode)" 기록 → 수동 측정 지시
```

### C3 — DSP 강등 (viable 시 서버 ffmpeg 강등 모드 or NS1 스크립트 확장)

```typescript
// NS1 spike 에서 작성된 스크립트 (highpass IIR + EQ + echo + crossfade, afftdn 제외) 확장
// NS1 log "SCRIPT:" 라인으로 경로 확인
// 서버 ffmpeg 직접 사용 가능 (afftdn 제거한 나머지 3개 필터 체인만 적용)
// 출력: apps/mobile/scripts/spike-results/07-ns4-C3-output.mp3
// 명령 예시:
//   ffmpeg -i input.wav \
//     -af "highpass=f=80,equalizer=f=300:width_type=o:width=2:g=3,\
//          aecho=0.8:0.9:1000:0.3" \
//     -ac 2 -ar 44100 -b:a 128k output.mp3
```

---

## SNR 계산 방법

서버 baseline (`m0_dsp_self_test.py` 결과 → master.mp3) 과 각 후보 출력 간 SNR 차이를 측정한다.

```bash
# ffmpeg astats 로 noise floor 측정 (m0-self-test 방법론 동일)
ffmpeg -i {output_file} -af "astats=metadata=1:reset=1" -f null - 2>&1 \
  | grep "RMS level dB"
```

SNR diff = `candidate_noise_floor_db - server_noise_floor_db`  
- 양수 = 후보가 baseline 보다 노이즈 적음 (더 좋음)
- 음수 = 후보가 baseline 보다 노이즈 많음 (합격선: diff ≥ `(15 - 21.64) = -6.64 dB` — 즉 후보 SNR ≥ 15 dB 유지 시 통과)

**합격선 판정**: `candidate_dsp_floor_db ≤ (server_raw_floor_db + 15)` 를 충족하면 PASS.  
m0-self-test 실측: raw_floor = -32.95 dBFS → 합격선 = -47.95 dBFS 이하.

---

## 채택 결정 표 (log 내 기록 형식)

```
=== NS4 Candidate Comparison ===
DATE: {ISO 8601}
INPUT_SHA256: {sha256}
SERVER_BASELINE_SNR: 21.64 dB (raw -32.95 → dsp -54.59 dBFS)
ACCEPTANCE_FLOOR: candidate noise floor ≤ -47.95 dBFS (≥ 15 dB improvement)

| 후보 | viable (NSx) | noise_floor_dBFS | SNR_pass | dep_delta | size_delta_mb | runtime_30s_ms | 종합 |
|------|--------------|------------------|----------|-----------|---------------|----------------|------|
| C1   | ?            | ?                | ?        | ?         | ?             | ?              | ?    |
| C2   | ?            | ?                | ?        | ?         | ?             | ?              | ?    |
| C3   | ?            | ?                | ?        | ?         | ?             | ?              | ?    |

WAVEFORM: docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-waveform.png
SPECTRAL:  docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-spectral.png

=== 사용자 청취 후 아래 라인을 수동 추가 ===
RESULT: ADOPTED = C? (사유: perceptual quality [PASS/MARGINAL] + SNR [PASS/FAIL] + 무게 우선순위)
# 또는:
RESULT: NO_GO (사유: 모든 viable 후보 noise_floor > -47.95 dBFS + 청취 기준 미달)
```

---

## GO/NO_GO 결정 표

| 조건 | 결과 | 후속 조치 |
|---|---|---|
| viable 후보 중 1+ 가 SNR 합격 + 사용자 청취 PASS | **GO → ADOPTED = Cx** | Story 2 architect-loop 재호출 (채택 후보 명시) 또는 사용자 직접 Story 2 impl 지시 |
| viable 후보 1+ 가 SNR 합격이나 사용자 청취 후 perceptual quality marginal | **ESCALATE** | 사용자 최종 판단 위임. "marginal 수용 or NO_GO or C4 별 epic" 결정 후 architect 재호출 |
| viable 후보 모두 SNR 합격선 미달 | **NO_GO** | §NO_GO 후속 절차 적용 |
| viable 후보 0개 (NS1~NS3 전부 not-viable) | **NO_GO** | 동일 |

**채택 우선 순위 (동률 시)**: C3 (강등, dep 0 + size < 1MB) > C1 (pure-JS, dep 적음) > C2 (RN-audio-api, native dep 추가)  
근거: architecture.md §3.1.B "가장 가벼움 채택" 원칙.

---

## NO_GO 후속 절차

viable 후보 0개 또는 모든 후보 품질 미달 시:

1. `07-ns4-candidate-comparison.log` 마지막 라인에 `RESULT: NO_GO` 기록
2. `docs/epics/epic-19-local-dsp/adr.md` ADR-19A 상태 주석 업데이트:
   ```
   **상태**: Superseded — NS1~NS4 모두 viable 0. V2+ 재진입 시 C4 별 epic 또는 ffmpeg-kit 부활 재평가.
   ```
3. `backlog.md` V2+ 항목 추가:
   ```
   - Epic 19 V2+ 재진입 — 조건: (a) C4 별 epic (afftdn-only 자체 native) 추진 결정
     또는 (b) ffmpeg-kit 활성 fork 부활 확인 시
   ```
4. Story 2 (#264) + Story 3 (#265) 이슈에 "NS4 NO_GO — 본 Story 폐기 또는 V2+ 이관" 코멘트 후 close
5. 사용자에게 보고 + C4 별 epic 진입 결정 위임

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | NS1~NS3 PR 머지 확인 후 진입 | (MANUAL) | `gh pr list --search "04-spike-ns1" --state merged` + `05-spike-ns2` + `06-spike-ns3` 세 건 모두 URL 반환 |
| REQ-002 | viable 후보 목록 NS1~NS3 log 에서 추출 | (MANUAL) | `grep "RESULT:" docs/epics/epic-19-local-dsp/spike-results/04-ns1*.log 05-ns2*.log 06-ns3*.log` → 각 `viable` / `not-viable` 판정 확인 |
| REQ-003 | 입력 파일 bit-identical (NS1 입력 동일) | (MANUAL) | `sha256sum {inputPath}` 결과 = NS1 log `INPUT_SHA256:` 값과 일치 |
| REQ-004 | viable 각 후보 DSP 출력 파일 생성 (mock 금지) | (MANUAL) | `ls -lh docs/epics/epic-19-local-dsp/spike-results/07-ns4-C?-output.*` → 각 viable 후보 파일 존재 + size > 0 |
| REQ-005 | 각 후보 noise_floor_dBFS 측정값 log 기록 | (MANUAL) | `grep "noise_floor_dBFS" docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-comparison.log` → viable 후보 행 모두 수치 존재 |
| REQ-006 | SNR 합격선 판정 (≤ -47.95 dBFS) log 기록 | (MANUAL) | `grep "SNR_pass" 07-ns4-candidate-comparison.log` → 각 후보 PASS / FAIL 명시 |
| REQ-007 | waveform overlay PNG 생성 (4-trace: 각 viable 후보 + server baseline) | (MANUAL) | `file docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-waveform.png` → PNG 형식 확인 |
| REQ-008 | spectral heatmap PNG 생성 (FFT 1024-window, side-by-side) | (MANUAL) | `file docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-spectral.png` → PNG 형식 확인 |
| REQ-009 | 사용자 blind listening test 수행 (자동 결정 금지) | (MANUAL) | 스크립트 종료 후 사용자가 각 후보 출력 파일을 직접 청취 + `RESULT: ADOPTED = C?` 또는 `RESULT: NO_GO` 라인을 log 에 수동 추가한 뒤 작업 완료 선언 |
| REQ-010 | RESULT 라인 log 말미에 존재 | (MANUAL) | `tail -5 07-ns4-candidate-comparison.log \| grep "^RESULT:"` → 1행 출력 (`ADOPTED = C?` or `NO_GO`) |
| REQ-011 | NO_GO 시 ADR-19A 상태 업데이트 + backlog.md V2+ 항목 추가 | (MANUAL) | NO_GO 분기 한정. `grep "Superseded" docs/epics/epic-19-local-dsp/adr.md` + `grep "Epic 19 V2+" backlog.md` → 각 1행 이상 |

**전체 통과 커맨드 (RESULT: ADOPTED 확정 후):**

```bash
# REQ-001~003: 사전 조건
gh pr list --search "04-spike-ns1" --state merged --json url --jq '.[0].url'
gh pr list --search "05-spike-ns2" --state merged --json url --jq '.[0].url'
gh pr list --search "06-spike-ns3" --state merged --json url --jq '.[0].url'

# REQ-004: 출력 파일 존재
ls -lh docs/epics/epic-19-local-dsp/spike-results/07-ns4-C?-output.*

# REQ-005~006: log 수치
grep -E "noise_floor_dBFS|SNR_pass" docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-comparison.log

# REQ-007~008: PNG 파일
file docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-waveform.png
file docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-spectral.png

# REQ-010: RESULT 라인
tail -5 docs/epics/epic-19-local-dsp/spike-results/07-ns4-candidate-comparison.log | grep "^RESULT:"
```

---

## 주의사항

1. **NS1~NS3 미완료 시 진입 금지.** 세 PR 중 하나라도 머지 미확인이면 ESCALATE. 이유: NS4 는 이전 spike 의 viability 결과를 입력으로 사용하며, 미완료 상태에서 진행하면 viable 목록이 불확실해 측정 결과 전체가 무효.

2. **사용자 blind listening 우회 금지.** 스크립트 안에 `adopted = 'C3'` 같은 자동 결정 코드를 넣지 마라. 이유: perceptual quality 는 SNR 수치만으로 대표되지 않는다 (SNR 합격해도 metallic artifact / reverb 과도 등 주관 판단 필수).

3. **C2 RN runtime 제약 명시.** C2 의 react-native-audio-api node graph 는 Hermes/JSC headless 환경에서 동작하지 않는다. Node.js 환경에서 직접 실행 시도 금지. 불가 시 log 에 `C2 SKIPPED: requires RN runtime` 기록 후 device/simulator 에서 별도 수동 측정 지시를 사용자에게 남겨라.

4. **입력 파일 재생성 금지.** `inputPath` 는 NS1 spike 와 동일 파일을 재사용해야 한다. 새로 합성하면 SHA-256 불일치 → 비교 무효. 파일이 없으면 NS1 spike 결과에서 경로를 찾아 복사하되 내용을 바꾸지 마라.

5. **C4 측정 대상 포함 금지.** architecture.md §3.1.B 명시대로 C4 = 별 epic 규모. 본 NS4 에서 C4 iOS Accelerate / KissFFT 구현을 시작하거나 측정하지 마라. 이유: native module 작성 = 필터당 1~2주 별도 작업이며, NS4 scope 를 초과해 spike 전체를 지연시킴.

6. **waveform / spectral plot 생성 시 Python 환경.** `matplotlib` + `librosa` (또는 `scipy`) 를 사용하라. `apps/api/` 가상환경이 이미 설치된 경우 재사용 가능 (`pip show librosa`). 없으면 `pip install librosa matplotlib` 후 진행. Node.js 환경에서 직접 plot 생성 시도 금지 (지원 라이브러리 없음).

7. **engineer agent git commit 금지.** 결과 파일 생성 후 git stage/commit 하지 마라. PR 은 사용자 확인 + blind listening 완료 후 별도 지시로 올린다.

---

## 다른 모듈과의 경계

| 경계 | 방향 | 내용 |
|---|---|---|
| impl/04 NS1 (`04-spike-ns1-afftdn-perceptual.md`) | 입력 | C3 viability + 입력 파일 경로 + INPUT_SHA256 + NS1 측정 스크립트 경로 |
| impl/05 NS2 (`05-spike-ns2-pure-js-perf.md`) | 입력 | C1 viability + pure-JS 측정 스크립트 경로 (재사용) |
| impl/06 NS3 (`06-spike-ns3-rn-audio-api-integration.md`) | 입력 | C2 viability + RN-audio-api probe 코드 경로 (확장 사용) |
| `docs/m0-dsp-self-test.md` | 입력 | server baseline SNR (-54.59 dBFS noise floor / 21.64 dB improvement) + 합격선 기준 |
| 메인 Claude (사용자) | 출력 | ADOPTED 결정 후 Story 2 impl 작성 결정 또는 NO_GO 후 V2+ 이관 결정 위임 |
| Story 2 impl (`architecture.md §3.2` 모듈) | 의존 수신 | ADOPTED 후보 종류에 따라 Story 2 `FfmpegBridge` / `DspPipeline` 구현 방향 결정 |

---

## DB 영향도

영향 없음 — 본 spike 는 스크립트 실행 + 결과 파일 생성만. DB 스키마/마이그레이션 변경 없음.

---

## 참조

- `docs/epics/epic-19-local-dsp/architecture.md` §3.1.B, §3.1.C, §9.2
- `docs/epics/epic-19-local-dsp/adr.md` ADR-19A, ADR-19D, ADR-19E
- `docs/m0-dsp-self-test.md` — 서버 baseline 수치 원본
- `docs/epics/epic-19-local-dsp/spike-results/` — NS1~NS3 log 파일 (의존)
- GitHub Issue: [#263](https://github.com/alruminum/jajang/issues/263) (Story 1)
- Epic Issue: [#262](https://github.com/alruminum/jajang/issues/262)
