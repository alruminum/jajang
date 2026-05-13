# NS2 spike — pure-JS DSP 처리시간 측정 실행 가이드

**목적**: Galaxy Android 디바이스에서 Hermes JS engine 으로 pure-JS DSP 4 효과 체인 처리시간 측정 (C1 viability gate)

**주의**: 시뮬레이터 / 에뮬레이터 측정 금지. 실기기 Hermes only.

---

## 파일 목록

| 파일 | 설명 |
|---|---|
| `apps/mobile/scripts/spike-ns2-pure-js-perf.ts` | DSP 측정 함수 구현 + `runSpike()` 진입점 |
| `apps/mobile/scripts/input_30s.wav` | 30s 테스트 WAV (사전 생성 필요) |
| `apps/mobile/src/screens/SpikeNs2Screen.tsx` | Hermes 실행용 임시 화면 (방법 B) |
| `docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log` | 측정 결과 저장 위치 |

---

## 사전 준비 (최초 1회)

### 1. fft.js 설치 확인

```bash
cd apps/mobile
# 이미 설치됨 (package.json 에 fft.js@^4.0.4 추가됨)
# 미설치 시:
npm install fft.js
```

### 2. 입력 WAV 생성

```bash
# 프로젝트 루트 또는 apps/mobile 에서
ffmpeg -f lavfi -i "sine=frequency=300:duration=30" -ar 44100 -ac 1 \
  -sample_fmt s16 apps/mobile/scripts/input_30s.wav

# 생성 확인 (duration=30.000000, sample_rate=44100)
ffprobe -v quiet -show_entries stream=duration,sample_rate,channels \
  -of default=noprint_wrappers=1 apps/mobile/scripts/input_30s.wav
```

### 3. Navigator 에 임시 screen 등록

`apps/mobile/src/navigation/MainNavigator.tsx` 에 아래 라인 임시 추가:

```tsx
// ⚠️ SPIKE ONLY — 측정 후 제거 의무
import SpikeNs2Screen from '@screens/SpikeNs2Screen';
// Stack.Navigator 안에:
<Stack.Screen name="SpikeNs2" component={SpikeNs2Screen} />
```

---

## 실행 방법

### Step 1 — 앱 빌드 및 실기기 배포

```bash
cd apps/mobile
npx expo run:android    # Galaxy 실기기 연결 후
```

### Step 2 — WAV 파일 디바이스 복사

```bash
adb push apps/mobile/scripts/input_30s.wav /sdcard/Download/input_30s.wav
```

### Step 3 — 앱에서 SpikeNs2 화면 진입

DevMenu (Cmd+M 또는 흔들기) → Navigate → "SpikeNs2"

또는 S06HomeScreen 등 적당한 화면에서 임시 버튼으로 `navigation.navigate('SpikeNs2')` 호출.

### Step 4 — "Copy WAV" 버튼 탭

앱 내 "Copy WAV" 버튼으로 `/sdcard/Download/input_30s.wav` → `documentDirectory/input_30s.wav` 복사.

### Step 5 — "Run Spike" 버튼 탭

측정 시작. 완료까지 수십 초 소요 예상 (저사양 시 최대 수 분).

### Step 6 — adb logcat 캡처

별도 터미널에서 측정 중 또는 완료 후:

```bash
adb logcat | grep -E "SPIKE_NS2|RESULT:" > \
  docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
```

또는 전체 캡처 후 필터:

```bash
adb logcat -d | grep -E "SPIKE_NS2|ReactNativeJS" > /tmp/ns2-raw.log
grep -E "SPIKE_NS2" /tmp/ns2-raw.log > docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
```

---

## 예상 log 형식

```
SPIKE_NS2 hermes: true
SPIKE_NS2 device: android 34
SPIKE_NS2 loading WAV: file:///data/user/0/com.jajang.app/files/input_30s.wav
SPIKE_NS2 inputSamples: 1323000
SPIKE_NS2 highpass: 123.45ms (samples=1323000)
SPIKE_NS2 highpass outputSamples: 1323000 (match=true)
SPIKE_NS2 biquadEq: 234.56ms (samples=1323000)
SPIKE_NS2 biquadEq outputSamples: 1323000 (match=true)
SPIKE_NS2 delay: 345.67ms (samples=1323000)
SPIKE_NS2 delay outputSamples: 1323000 (match=true)
SPIKE_NS2 crossfade: 12.34ms (samples=1323000)
SPIKE_NS2 crossfade outputSamples: 1309614 (seg1=661500+seg2=661500-fade=13230=1309770)
SPIKE_NS2 chain4: 789.01ms
SPIKE_NS2 fft-lib: fft.js@4.0.4 size=1024
SPIKE_NS2 spectralGate-JS: 5678.90ms (samples=1323000)
SPIKE_NS2 chain4+afftdn: 6234.56ms
SPIKE_NS2 RESULT: C1 viable (full JS) — chain4=789ms chain4+afftdn=6234ms
SPIKE_NS2 NOTE: S24+ (고사양) 측정값. 저사양 Galaxy A 시리즈 미측정 시 RESULT 는 참고값만.
SPIKE_NS2 done.
```

---

## 수용 기준 (REQ-001~006) 검증

### REQ-001: Hermes 확인
```bash
grep "hermes: true" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
```

### REQ-002: 입력 샘플 수 확인
```bash
grep "inputSamples:" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
# → 1323000 (±4410)

ffprobe -v quiet -show_entries stream=duration -of default=noprint_wrappers=1 \
  apps/mobile/scripts/input_30s.wav
# → duration=30.000000
```

### REQ-003: 각 효과 출력 길이 확인
```bash
grep "outputSamples" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
```

### REQ-004: 7행 타이밍 모두 존재 확인
```bash
for effect in highpass biquadEq delay crossfade chain4 spectralGate-JS "chain4+afftdn"; do
  grep -c "$effect:" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
done
```

### REQ-005: 디바이스 정보 확인
```bash
grep "device:" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log
```

### REQ-006: RESULT 라인 존재 확인
```bash
grep "^SPIKE_NS2 RESULT:" docs/epics/epic-19-local-dsp/spike-results/05-ns2-pure-js-perf.log | wc -l
# → 1
```

---

## 서버 DSP 파라미터 vs plan 파라미터 불일치 기록

서버 `ffmpeg_service.py` 실측값이 plan 지정값과 다름 (본 스크립트는 서버 실측값 사용):

| 파라미터 | plan §주의사항 4 | 서버 실측 (`DspService`) | 본 스크립트 |
|---|---|---|---|
| EQ freq | 300Hz, Q=2 (octave) | 2500Hz, width_type=h, width=200 | 2500Hz, Q≈12.5 (서버 실측) |
| echo in | 0.8 | 0.6 | 0.6 (서버 실측) |
| echo out | 0.9 | 0.3 | 0.3 (서버 실측) |
| echo delay | 1000ms | 100ms | 100ms (서버 실측) |
| highpass | 80Hz (강등 대체) | afftdn nr=10:nf=-25 | 80Hz IIR (강등 대체 동일) |
| crossfade | 300ms tri | 300ms tri | 300ms tri (일치) |

**영향**: NS4 perceptual diff baseline 에서 이 스크립트 출력 = 서버 출력과 동일 파라미터 set 이므로 비교 유효. plan 문서 파라미터 정오 필요 → module-architect 보강 권고.

---

## 저사양 기기 ESCALATE 처리 (Galaxy A 미보유 시)

현재 보유 = Galaxy S24+ (Snapdragon 8 Gen 3, 고사양). 저사양 Android (Galaxy A 시리즈, Snapdragon 700 이하) 미보유 시:

1. S24+ 측정값은 log 에 기록 (chain4 / chain4+afftdn 수치 남김)
2. RESULT 라인 = `RESULT: ESCALATE — 고사양 측정 X.Xs, 저사양 미측정. 저사양 기기 확보 요청`
3. 사용자 판단 → 저사양 기기 확보 또는 S24+ 수치로 "최악 추정" 판단

> S24+ 에서 30s 내 완료되어도 저사양 에서 실패 가능. S24+ 에서 실패하면 저사양은 확실히 실패.
```
