---
depth: std
story: 1
task_index: 2/4
design: not-required
---

# 05 — spike-ns2-pure-js-perf

**목적**: C1 후보 (pure-JS DSP over WAV/PCM Buffer) 의 viability 를 측정한다. Galaxy A 시리즈 저사양 Android 에서 30s WAV 입력 → 4 효과 (highpass IIR / biquad EQ / delay buffer / gain ramp) 직접 JS 구현 → 처리 시간 ≤ 30s 인지 확인. afftdn 자체 JS (fft-lib 기반 spectral gating) 도 별도 측정.

**결정할 것**: `architecture.md §3.1.B` C1 후보 viability (저사양 Android Hermes 환경 처리 시간 한계).

---

## 사전 준비 (먼저 read 필수)

진입 전 아래 파일을 읽어 컨텍스트를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1.A 효과-후보 매트릭스, §3.1.B 통합 후보 C1 정의, §3.1.C NS2 PASS 조건, §9.2 새 Spike Gate 상태
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A (C1~C4 후보 set 결정 근거)
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 NS2 행 + NO_GO 분기
- `apps/mobile/package.json` — 현 RN(0.83.6) / Expo(55) / Hermes 버전 확인
- `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` — 디바이스 정보 (Galaxy S24+ 실측 환경, 단 본 NS2 는 저사양 Android 우선)

이전 spike 의존 없음 (NS1 과 병렬 진행 가능).

---

## Scope

본 task 는 **측정 스크립트 작성 + 실기기 실행 + log 기록** 만 다룬다.

- **작업 대상**: `apps/mobile/scripts/spike-ns2-pure-js-perf.ts` (일회성 spike 스크립트, prod 번들 미포함)
- **결과 산출물**: `docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log`
- **다른 레이어 손대지 말 것**: prod 소스(`src/`), 테스트(`__tests__`), 기존 스크립트 수정 X

---

## 인터페이스

### 측정 스크립트 함수 시그니처

```typescript
// apps/mobile/scripts/spike-ns2-pure-js-perf.ts

/** 1차 IIR highpass (afftdn 강등 대체). cutoff 80Hz, sr 44100 */
function applyHighpass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array

/** 표준 biquad peak EQ. equalizer=f=300:width_type=o:width=2:g=3 등가 */
function applyBiquadEq(samples: Float32Array, freq: number, gain: number, q: number, sampleRate: number): Float32Array

/** 단일 delay line + decay + wet. aecho=0.8:0.9:1000:0.3 등가 */
function applyDelay(samples: Float32Array, delayMs: number, decay: number, wet: number, inGain: number, sampleRate: number): Float32Array

/** triangular gain ramp crossfade. acrossfade=d=0.3:c1=tri:c2=tri 등가 */
function applyCrossfade(seg1: Float32Array, seg2: Float32Array, fadeMs: number, sampleRate: number): Float32Array

/** afftdn JS 구현 — 외부 fft lib 사용. 1024-window spectral gating */
function applySpectralGate(samples: Float32Array, noiseReductionDb: number, noiseFloorDb: number, fftLib: FFTLib): Float32Array

/** 타이밍 측정 결과 */
interface TimingResult {
  effectName: string
  durationMs: number
  inputSamples: number
}

/** 전체 spike 실행 진입점 */
async function runSpike(): Promise<void>
```

**핵심 규칙**:
- 모든 함수는 입력 `Float32Array` 를 **변형하지 말 것** (immutable — 새 Float32Array 반환). 이유: 측정 루프에서 동일 입력으로 각 효과를 독립 측정해야 함
- `performance.now()` 는 각 효과 함수 호출 직전/직후 양쪽에서 호출. 단위 = ms
- afftdn JS 측정은 **별도 `TimingResult` 행** — 4 효과 합계 + afftdn-on 합계를 구분 기록

---

## 핵심 로직

```
1. 입력 WAV 생성 확인
   → ffmpeg -f lavfi -i "sine=frequency=300:duration=30" -ar 44100 -ac 1 input_30s.wav
   → 파일을 Float32Array 로 로드 (WAV raw PCM parse: 44바이트 헤더 skip + Int16 → Float32)

2. 저사양 Android 확인
   → Platform.OS, Platform.Version, DeviceInfo (brand/model 로그 출력) 또는 수동 기록
   → 저사양 기기 부재 시 → ESCALATE 처리 (주의사항 3 참조)

3. 효과별 독립 측정 (각 효과는 동일 원본 samples 사용)
   t0 = performance.now()
   applyHighpass(samples, 80, 44100)
   t1 = performance.now()
   → log "highpass: Xms"

   t2 = performance.now()
   applyBiquadEq(samples, 300, 3, 2, 44100)
   t3 = performance.now()
   → log "biquadEq: Xms"

   t4 = performance.now()
   applyDelay(samples, 1000, 0.3, 0.9, 0.8, 44100)
   t5 = performance.now()
   → log "delay: Xms"

   seg1 = samples.slice(0, samples.length/2)
   seg2 = samples.slice(samples.length/2)
   t6 = performance.now()
   applyCrossfade(seg1, seg2, 300, 44100)
   t7 = performance.now()
   → log "crossfade: Xms"

4. 4 효과 체인 합계 측정 (직렬 파이프, 각 출력이 다음 입력)
   tChainStart = performance.now()
   out = applyHighpass(...) → applyBiquadEq(...) → applyDelay(...) → applyCrossfade(...)
   tChainEnd = performance.now()
   → log "4-effect chain: Xms"

5. afftdn JS (fft-lib 사용) 측정 — 별도
   fftLib = require('<fft-lib>')
   t_fft_start = performance.now()
   applySpectralGate(samples, 10, -25, fftLib)
   t_fft_end = performance.now()
   → log "spectralGate-JS: Xms"

   t_full_start = performance.now()
   applySpectralGate(...) → applyBiquadEq(...) → applyDelay(...) → applyCrossfade(...)
   t_full_end = performance.now()
   → log "4-effect+afftdn chain: Xms"

6. RESULT 라인 판정 및 출력
   chain4 ≤ 30000ms → C1 viable (afftdn 강등 = viable)
   chain4+fft ≤ 30000ms → C1 full viable
   chain4 > 30000ms → C1 NO_GO
   → log "RESULT: ..."
```

---

## 측정 환경 설정

### 입력 파일 생성 (측정 전 1회 실행)

```bash
# apps/mobile 디렉토리에서
ffmpeg -f lavfi -i "sine=frequency=300:duration=30" -ar 44100 -ac 1 \
  -sample_fmt s16 apps/mobile/scripts/input_30s.wav
```

생성 파일: `apps/mobile/scripts/input_30s.wav`
- Sample rate: 44100 Hz
- Channels: 1 (mono)
- Duration: 30.0s (± 0.1s 허용)
- Samples: 1,323,000 (= 44100 × 30)
- Format: PCM 16-bit signed little-endian

### fft lib 설치 (afftdn JS 측정 전)

1. `fft.js` npm 패키지 설치 시도:
   ```bash
   cd apps/mobile && npm install fft.js
   ```
2. 설치 실패 시 대안 후보 (순서대로 시도):
   - `jsfft` (npm)
   - `kissfft.js` (npm)
   - `dsp.js` (npm)
3. 모두 실패 시 Cooley-Tukey 1024-bin 직접 구현 (스크립트 내 inline < 50줄). 이유: fft-lib 의 외부 production 가정을 유지하기 위해 공개 lib 우선. 직접 구현 시 로그에 "fft-lib: inline-cooley-tukey" 기록

### 스크립트 실행 방법

```bash
# apps/mobile 에서 — Hermes 에서 ts-node 가 아닌 metro bundler 경유 실행
# 방법 A: Expo Go custom entry (권장)
# apps/mobile/index.js 임시 교체 → runSpike() 호출 → adb logcat 캡처

# 방법 B: React Native 앱 내 임시 화면 (DevMenu 에서 실행)
# useEffect 에서 runSpike() 호출 → console.log → Metro/adb logcat

# adb logcat 필터 (Android)
adb logcat | grep -E "SPIKE_NS2|RESULT:"
```

> Hermes 환경 외 실행(Node.js/ts-node) 금지. x86 에뮬레이터 금지. 이유: Hermes typed array 산술 성능이 다름.

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | 실행 환경이 Hermes (JS engine) 임을 로그로 확인 | (MANUAL) | log 에 `HermesInternal` 객체 존재 확인 라인 포함. `global.HermesInternal !== undefined` 출력 = `true` |
| REQ-002 | 입력 WAV 길이 30.0 ± 0.1s (= 샘플 수 1,323,000 ± 4,410) | (MANUAL) | log 에 `inputSamples: 1323000` (±4410) 라인. `ffprobe -show_entries stream=duration input_30s.wav` → `30.0` |
| REQ-003 | 4 효과 함수 (highpass / biquadEq / delay / crossfade) 각각 출력 길이 = 입력 길이 (crossfade 제외) | (MANUAL) | log 에 각 효과 `outputSamples == inputSamples` 확인 라인 (crossfade 는 seg1.length + seg2.length = 입력 길이 정합) |
| REQ-004 | `performance.now()` 측정값이 각 효과별로 기록됨 | (MANUAL) | log 에 `highpass: Xms / biquadEq: Xms / delay: Xms / crossfade: Xms / chain4: Xms / spectralGate-JS: Xms / chain4+afftdn: Xms` 7행 모두 존재 |
| REQ-005 | 측정 디바이스 model 명시 | (MANUAL) | log 에 `device: <brand> <model> Android <version>` 라인. 저사양 Android (Galaxy A 시리즈 또는 Snapdragon 700 이하 동급) 부재 시 → ESCALATE (주의사항 3 참조) |
| REQ-006 | RESULT 한 줄이 log 마지막 행에 존재 | (MANUAL) | log 에 `RESULT: C1 viable ...` 또는 `RESULT: C1 NO_GO ...` 또는 `RESULT: C1 partial ...` 중 1개 |

**통과 커맨드**:

```bash
# 실행 + log 캡처
adb logcat -c && adb logcat | grep -E "SPIKE_NS2|highpass|biquadEq|delay|crossfade|chain4|spectralGate|RESULT:" > \
  docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log

# REQ-002 입력 파일 확인
ffprobe -v quiet -show_entries stream=duration -of default=noprint_wrappers=1 \
  apps/mobile/scripts/input_30s.wav

# REQ-006 RESULT 라인 존재 확인
grep "^RESULT:" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log | wc -l
# → 출력 = 1
```

---

## 주의사항

1. **mock 측정 금지**. Galaxy 실기기 실행 의무. 시뮬레이터 / 에뮬레이터 측정 = mobile thermal/cache 미반영, x86 translation 2~5× 차이 + Hermes 시뮬 측정 신뢰 불가. 로그에 시뮬레이터 device model 이 찍히면 FAIL 처리.

2. **fft.js 계열 npm lib 사용 의무** (afftdn-on JS 측정 시). 자체 FFT 구현 = 외부 production 가정 위반. lib 미설치 성공 시 log 에 `fft-lib: <패키지명>@<버전>` 기록. 어쩔 수 없는 inline 직접 구현만 예외 (log 에 명시).

3. **저사양 device 우선, 부재 시 ESCALATE**. 현 사용자 보유 = Galaxy S24+ (고사양, Snapdragon 8 Gen 3). 저사양 Android (Galaxy A 시리즈, Snapdragon 700 이하 또는 동급 Exynos 1000 이하) 미보유 시 다음 처리:
   - Galaxy S24+ 측정은 진행 (log 에 측정값 기록)
   - RESULT 라인 = `RESULT: ESCALATE — 고사양 측정 X.Xs, 저사양 미측정. 저사양 기기 확보 요청`
   - 즉, S24+ 만으론 C1 viable/NO_GO 결론 낼 수 없음. 저사양 gap 을 명시해 사용자에게 위임

4. **DSP 파라미터 일관성**. 서버 ffmpeg 4 필터 chain 과 동일 파라미터 의무:
   - highpass: `cutoff=80Hz` (afftdn 강등 대체 — `nr=10:nf=-25` 등가 아님, 강등 후보)
   - biquadEq: `f=300, g=+3dB, Q=2` (octave width 2 = Q ≈ 2 근사)
   - delay: `delayMs=1000, decay=0.3, wet=0.9, inGain=0.8` (aecho=0.8:0.9:1000:0.3 등가)
   - crossfade: `fadeMs=300, shape=triangular` (acrossfade=d=0.3:c1=tri:c2=tri 등가)
   - 파라미터 달리 측정 시 NS4 perceptual diff baseline 불일치 → 설계 의도 위반

5. **engineer agent git commit 금지**. 본 spike 산출물 = log 파일 + 스크립트. commit/push 는 메인 Claude 가 sub-PR 로 처리.

---

## 후속 분기 (RESULT 별 engineer 행동)

engineer 는 측정 후 아래 분기에 따라 log 끝에 `NEXT_ACTION` 주석을 기록한다:

| RESULT | 의미 | NEXT_ACTION |
|---|---|---|
| `C1 viable (full JS)` — chain4+afftdn ≤ 30s | C1 채택 가능, afftdn JS 포함 | `NS4 진입 가능. C1 full = C2/C3 와 perceptual 비교 후 선정` |
| `C1 partial (afftdn 강등만)` — chain4 ≤ 30s, chain4+afftdn > 30s | C1 은 afftdn 강등 시에만 viable → C3 와 동치 | `NS4 에서 C2 와 비교. afftdn JS = too slow 확정` |
| `C1 NO_GO` — chain4 > 30s | C1 폐기 | `C1 후보 폐기. NS3 + NS1 결과에 따라 C2/C3/C4 만 NS4 후보` |
| `ESCALATE` — 저사양 미측정 | 결론 보류 | `사용자에게 저사양 기기 확보 요청. S24+ 측정값만 참고` |

---

## DB 영향도

영향 없음. 본 task 는 순수 측정 스크립트 + log 파일 생성. DB 스키마 / 마이그레이션 변경 0.

---

## 다른 모듈과의 경계

- **impl/04 (NS1 — afftdn 강등 perceptual diff)**: 독립. NS1 은 서버측 SNR 측정, NS2 는 mobile JS 처리 시간. 병렬 실행 가능
- **impl/06 (NS3 — RN-audio-api Expo Bare 통합)**: 독립. NS2 가 NO_GO 여도 NS3 는 별도 진행
- **impl/07 (NS4 — 후보 perceptual 비교)**: NS2 결과가 NS4 의 C1 후보 viability 입력. NS2 ESCALATE 시 NS4 일부 보류
