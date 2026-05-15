---
depth: std
design: not-required
story: 1
task_index: 1/4
---

# 04 — Spike NS1: afftdn 강등 perceptual diff

**Epic 19 Story 1 — NS1 spike: C3 후보 viability 측정**

> 본 task 는 서버 측 ffmpeg DSP 환경만 사용한다. mobile 빌드 0, RN 의존 0. 측정 스크립트를 작성·실행하고 결과 log + PNG 1개를 산출한다.

---

## 사전 준비 (먼저 read 필수)

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `docs/epics/epic-19-local-dsp/architecture.md` — §3.1.A 효과→후보 매트릭스 (afftdn 행) + §3.1.B C3 후보 + §3.1.C NS1 정의 + §9.2 Spike Gate 표
- `docs/epics/epic-19-local-dsp/adr.md` — ADR-19A 새 결정 (re-evaluating) + 다음 단계 체크박스
- `docs/epics/epic-19-local-dsp/stories.md` — Story 1 NS1 행 + PASS 조건
- `docs/m0-dsp-self-test.md` — SNR 측정 baseline (SNR 21.64 dB, 합격선 ≥15 dB)
- `apps/api/app/services/dsp/ffmpeg_service.py` — 실제 서비스 DSP 파라미터 확인 (m0-self-test.md 기술 내용과 다름 — 아래 §인터페이스 §핵심 로직 참조)
- `apps/api/scripts/m0_dsp_self_test.py` — 기존 self-test 스크립트 (입력 합성 방법 + SNR 측정 방식 재사용 기준)
- `docs/epics/epic-19-local-dsp/spike-results/01-fork-build.log` — task 01 NO_GO 확정 사실 (framing reset 트리거)

이전 spike task 의존 없음 (NS1 은 서버 ffmpeg 환경 단독).

---

## Scope

**본 task 가 다루는 것**:
- `apps/api/scripts/spike_ns1_afftdn_perceptual.py` — 측정 스크립트 신규 작성·실행
- `docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log` — 측정 결과 log
- `docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.png` — waveform/spectral 비교 PNG

**본 task 가 손대지 않는 것**:
- `apps/mobile/` 내 어떤 파일도 변경 금지
- `apps/api/app/` 프로덕션 코드 변경 금지 (스크립트 추가만)
- `docs/ARCHITECTURE.md` / `docs/ADR.md` 본문 변경 금지 (spike PASS 후 별도 sub-PR)

---

## 인터페이스

### 스크립트: `apps/api/scripts/spike_ns1_afftdn_perceptual.py`

```python
# 실행:
#   cd apps/api && .venv/bin/python scripts/spike_ns1_afftdn_perceptual.py
#   출력: docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log
#          docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.png
```

**핵심 함수 시그니처** (내부 구현은 engineer 재량, 아래 핵심 규칙 준수):

```python
def synth_voice_clip(out_path: Path, freq_hz: int = 220, noise_db: int = -25) -> None:
    """m0_dsp_self_test.py 의 synth_voice_clip 동일 구현 재사용.
    30s, 44100Hz mono, sine + white noise -25dBFS.
    새 sample 녹음 금지 — baseline 동등성 의무 (§주의사항 2).
    """

def measure_noise_floor_db(audio_path: Path) -> float:
    """ffmpeg astats=metadata=1:reset=1 으로 RMS level dB 측정.
    m0_dsp_self_test.py measure_noise_floor_db 동일 방식.
    반환: float (dB), NaN 허용 (측정 실패 시).
    """

def apply_full_chain(input_path: Path, output_path: Path) -> None:
    """서버 DspService._apply_individual_dsp 와 동일 ffmpeg filter chain 적용.
    핵심 규칙: ffmpeg_service.py 의 실제 파라미터 그대로 사용:
      - AFFTDN_NR=10, AFFTDN_NF=-25
      - EQ_FREQ=2500, EQ_WIDTH=200, EQ_GAIN=3, width_type=h
      - AECHO_IN=0.6, AECHO_OUT=0.3, AECHO_DELAY=100, AECHO_DECAY=0.3
    m0-self-test.md 기술된 인자 (aecho=0.8:0.9:1000:0.3 / equalizer f=300) 와
    실제 ffmpeg_service.py 인자가 다름 — 반드시 ffmpeg_service.py 소스 직접 확인 후 사용.
    """

def apply_degraded_chain(input_path: Path, output_path: Path, hp_cutoff_hz: int = 80) -> None:
    """afftdn 제거 + 1차 highpass IIR 대체 chain.
    filter: highpass=f={hp_cutoff_hz}:poles=1,equalizer=...,aecho=...
    afftdn 인자 0, 나머지 EQ/echo 인자 = full_chain 과 동일.
    """

def compute_snr_improvement(raw_path: Path, processed_path: Path) -> float:
    """noise floor 개선량 (dB). abs(processed_floor - raw_floor).
    반환: float (양수 = 개선, 0 이하 = 악화/동등).
    """

def plot_comparison(
    raw_path: Path,
    full_chain_path: Path,
    degraded_chain_path: Path,
    output_png: Path,
) -> None:
    """waveform 또는 spectral 비교 PNG 1개 생성.
    matplotlib 사용. 3-row subplot: raw / full / degraded.
    출력: output_png (PNG 파일).
    matplotlib 미설치 시 ImportError → 경고 출력 후 PNG 생성 skip (log 에 SKIP_PNG 기록).
    """

def main() -> int:
    """측정 실행 + log 파일 기록 + PNG 생성.
    반환: 0 (RESULT: C3 viable) | 1 (RESULT: C3 NO_GO).
    """
```

**핵심 규칙 (invariant)**:
- `ffmpeg_service.py` 에서 파라미터를 *직접 import* 하거나 *소스 직접 확인 후* 수동 복사. 두 버전 불일치 시 측정 결과 무효.
- `measure_noise_floor_db` 는 `m0_dsp_self_test.py` 와 동일 ffmpeg astats 방식. 다른 방식 (sox stats 등) 혼용 시 baseline 비교 불가.
- mock SNR 계산 금지 — ffmpeg 실제 출력 파싱 의무 (§주의사항 1).

### 결과 log 형식: `04-ns1-afftdn-perceptual.log`

```
# Epic 19 NS1 — afftdn 강등 perceptual diff
측정일: YYYY-MM-DD
환경: macOS/Linux, ffmpeg X.Y, Python X.Y

[full chain]
raw_floor_db: -XX.XX dBFS
full_chain_floor_db: -XX.XX dBFS
full_chain_snr_improvement: XX.XX dB

[degraded chain (afftdn 제거 + highpass IIR f=80Hz)]
degraded_chain_floor_db: -XX.XX dBFS
degraded_chain_snr_improvement: XX.XX dB

[비교]
snr_diff_db: XX.XX dB  (full - degraded; 양수 = full 우위)
c3_viable_threshold_snr: 15.0 dB
c3_viable_threshold_diff: 6.0 dB
degraded_snr_pass: YES/NO  (≥15.0 dB?)
snr_diff_pass: YES/NO  (≤6.0 dB?)

RESULT: C3 viable (SNR diff ≤ 6dB AND degraded SNR ≥ 15dB)
# 또는
RESULT: C3 NO_GO (SNR diff > 6dB or degraded SNR < 15dB)
```

---

## 핵심 로직

```
INPUT: synth_voice_clip (30s, 44100Hz mono, sine+noise -25dBFS)
       → m0_dsp_self_test.py synth_voice_clip 동일 구현

STEP 1 — 기준 SNR (full chain):
  raw → apply_full_chain → full_output
  full_snr = compute_snr_improvement(raw, full_output)
  # 기대: ~21.64dB (m0-self-test baseline)

STEP 2 — 강등 SNR (degraded chain):
  raw → apply_degraded_chain → degraded_output
  degraded_snr = compute_snr_improvement(raw, degraded_output)

STEP 3 — 합격 판정:
  snr_diff = full_snr - degraded_snr
  C3_viable = (degraded_snr >= 15.0) AND (snr_diff <= 6.0)

STEP 4 — PNG 생성:
  plot_comparison(raw, full_output, degraded_output, output_png)

STEP 5 — log 기록:
  write 04-ns1-afftdn-perceptual.log
  exit 0 (C3 viable) | exit 1 (C3 NO_GO)
```

**판정 기준 근거**:
- `degraded_snr ≥ 15.0 dB` — m0-self-test §합격 기준 (stories.md §완료 기준 2 "노이즈 SNR ≥15dB")
- `snr_diff ≤ 6.0 dB` — "degraded 가 full 대비 6dB 이내 열화" = 청취자 구분 어려운 임계 (EBU R128 기반, 본 spike 의 product 결정 근거)

---

## 수용 기준

| REQ | 내용 | 검증 | 통과 조건 |
|---|---|---|---|
| REQ-001 | 측정 환경 확인 — ffmpeg 설치 + 버전 출력 | (MANUAL) | `cd apps/api && ffmpeg -version` → exit 0 + 버전 출력. log 파일 첫 줄에 ffmpeg 버전 기록 |
| REQ-002 | 입력 data = m0_dsp_self_test.py 동일 synth_voice_clip (30s, 44100Hz, sine+noise) | (TEST) | `cd apps/api && .venv/bin/python scripts/spike_ns1_afftdn_perceptual.py` 실행 후 `04-ns1-afftdn-perceptual.log` 존재 + `raw_floor_db` 값이 -35 dB ~ -30 dB 범위 내 (m0-self-test 측정값 -32.95 dBFS 기준 ±3dB) |
| REQ-003 | full chain = ffmpeg_service.py 실제 파라미터 그대로 (AFFTDN_NR=10, AFFTDN_NF=-25, EQ_FREQ=2500, EQ_WIDTH=200, EQ_GAIN=3, AECHO_IN=0.6, AECHO_OUT=0.3, AECHO_DELAY=100, AECHO_DECAY=0.3) | (MANUAL) | `grep -n "afftdn\|equalizer\|aecho" apps/api/scripts/spike_ns1_afftdn_perceptual.py` → full_chain 함수 내 파라미터가 ffmpeg_service.py DspService 상수와 일치 확인 |
| REQ-004 | SNR 계산 방법 = ffmpeg astats=metadata=1:reset=1 RMS level dB (m0_dsp_self_test.py measure_noise_floor_db 동일) | (MANUAL) | `grep "astats" apps/api/scripts/spike_ns1_afftdn_perceptual.py` → 1건 이상 매치 |
| REQ-005 | RESULT 라인 존재 + C3 viable / C3 NO_GO 둘 중 하나 | (MANUAL) | `grep "^RESULT:" docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log` → 1건 정확히 출력 |
| REQ-006 | PNG 생성 (또는 matplotlib 미설치 시 SKIP_PNG 기록) | (MANUAL) | `ls docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.png` exit 0 또는 `grep "SKIP_PNG" .../04-ns1-afftdn-perceptual.log` 1건 |
| REQ-007 | log 에 degraded_snr_pass + snr_diff_pass 양쪽 명시 | (MANUAL) | `grep "degraded_snr_pass\|snr_diff_pass" docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log` → 2건 매치 |

**전체 통과 커맨드**:
```bash
cd /Users/dc.kim/project/jajang/apps/api && \
  .venv/bin/python scripts/spike_ns1_afftdn_perceptual.py && \
  grep "^RESULT:" ../../docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log
```
exit 0 = C3 viable / exit 1 = C3 NO_GO. 어느 결과든 log 기록 완료 시 REQ 모두 통과.

---

## 주의사항

1. **mock SNR 계산 금지** — ffmpeg 실제 subprocess 실행 + stderr 파싱으로 RMS level 측정. 하드코딩 값 삽입 또는 계산 없이 결과 기록 시 측정 무효.

2. **m0-self-test 입력 data 그대로 재사용** — `synth_voice_clip` 함수는 `m0_dsp_self_test.py` 의 동일 구현 (sine 220Hz + white noise -25dBFS, 30s, 44100Hz, mono). 새 음성 파일 녹음 또는 다른 합성 방법 사용 금지. 이유: baseline SNR 21.64 dB 은 이 합성 방식 기준이므로 입력 달라지면 비교 무효.

3. **engineer agent 는 git commit 하지 마라** — 산출물은 log + png + 스크립트 3개. commit/push 금지. 이유: 통합 브랜치 (feature/local-dsp) 에 sub-PR 패턴으로 별도 적용 (ADR-19E). git 명령 자체를 실행하지 마라.

4. **mobile 코드 0** — `apps/mobile/` 디렉토리 열지 마라. 본 spike 는 서버 ffmpeg 환경 (macOS + ffmpeg) 에서만 동작. 이유: NS1 은 서버 DSP 파이프라인 perceptual diff 측정이고, mobile 빌드 의존 없다.

5. **Epic 19 통합 브랜치 패턴** — sub-PR 은 base = `feature/local-dsp` (main 아님). 이유: ADR-19E — long-lived integration branch 패턴, spike 실패 시 revert 비용 최소화. branch prefix: `feature/epic19_story1_ns1_afftdn_perceptual`.

6. **ffmpeg_service.py 파라미터 확인 의무** — m0-self-test.md 기술 인자와 ffmpeg_service.py 실제 상수가 다르다. `docs/m0-dsp-self-test.md` 의 `aecho=0.8:0.9:1000:0.3`, `equalizer=f=300` 은 문서 기준 (구버전 또는 예시). 실제 서비스 코드는 `AECHO_IN=0.6, AECHO_OUT=0.3, AECHO_DELAY=100`, `EQ_FREQ=2500`. 반드시 `apps/api/app/services/dsp/ffmpeg_service.py` 소스를 read 한 뒤 파라미터를 사용하라.

---

## 다른 모듈과의 경계

| 경계 대상 | 관계 | 본 task 접촉 여부 |
|---|---|---|
| task 01 (01-spike-fork-eval.md) | ffmpeg-kit fork 의존 — DEPRECATED | 접촉 X. 독립 측정 |
| apps/api/app/services/dsp/ffmpeg_service.py | 파라미터 참조 (read only) | read 만. 수정 금지 |
| apps/api/scripts/m0_dsp_self_test.py | synth_voice_clip + measure_noise_floor_db 구현 참조 | read 만. 수정 금지 |
| impl/05 NS2 (pure-JS perf) | 독립 spike (mobile-side 처리시간) | 접촉 X |
| impl/06 NS3 (RN-audio-api 통합) | 독립 spike (mobile-side 라이브러리) | 접촉 X |
| impl/07 NS4 (후보 비교) | 본 NS1 RESULT 를 입력으로 받음 | 본 log RESULT 라인 출력 후 NS4 진입 가능 |

---

## DB 영향도

**영향 없음** — 본 task 는 측정 스크립트 + 산출물 문서만 생성. DB 스키마/마이그레이션/프로덕션 코드 변경 0.

---

## 후속 분기

| RESULT | 후속 행동 |
|---|---|
| `C3 viable` (SNR ≥ 15dB AND diff ≤ 6dB) | C3 (DSP 강등 + UX 보강) 를 우선 채택 후보로 NS4 진입. NS2/NS3 결과와 합산 후 NS4 에서 최종 선정 |
| `C3 NO_GO` (SNR < 15dB OR diff > 6dB) | C3 폐기. NS2 (C1 viability) + NS3 (C2 viability) 결과만으로 NS4 후보 비교 진입. C4 (afftdn-only native) 도 NS4 후보 유지 |
