"""Spike NS1: afftdn 강등 perceptual diff 측정.

서버 측 ffmpeg DSP 환경만 사용.
full chain vs degraded chain (afftdn 제거 + highpass IIR) SNR 비교.

산출물:
  docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.log
  docs/epics/epic-19-local-dsp/spike-results/04-ns1-afftdn-perceptual.png
    (matplotlib 미설치 시 SKIP_PNG)

실행:
  cd apps/api && .venv/bin/python scripts/spike_ns1_afftdn_perceptual.py
"""

from __future__ import annotations

import datetime
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# ---------------------------------------------------------------------------
# 경로 설정
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]  # apps/api/
REPO_ROOT = ROOT.parents[1]                 # repo root
SPIKE_RESULTS_DIR = REPO_ROOT / "docs" / "epics" / "epic-19-local-dsp" / "spike-results"
LOG_PATH = SPIKE_RESULTS_DIR / "04-ns1-afftdn-perceptual.log"
PNG_PATH = SPIKE_RESULTS_DIR / "04-ns1-afftdn-perceptual.png"

CLIP_DURATION_S = 30

# ---------------------------------------------------------------------------
# DspService 파라미터 (ffmpeg_service.py DspService 상수와 정합 의무)
# ---------------------------------------------------------------------------
# 우선 import 시도; 실패 시 하드코딩 fallback (sys.path 의존 회피)
try:
    sys.path.insert(0, str(ROOT))
    from app.services.dsp.ffmpeg_service import DspService as _DspService
    AFFTDN_NR   = _DspService.AFFTDN_NR    # 10
    AFFTDN_NF   = _DspService.AFFTDN_NF    # -25
    EQ_FREQ     = _DspService.EQ_FREQ      # 2500
    EQ_WIDTH    = _DspService.EQ_WIDTH     # 200
    EQ_GAIN     = _DspService.EQ_GAIN      # 3
    AECHO_IN    = _DspService.AECHO_IN     # 0.6
    AECHO_OUT   = _DspService.AECHO_OUT    # 0.3
    AECHO_DELAY = _DspService.AECHO_DELAY  # 100
    AECHO_DECAY = _DspService.AECHO_DECAY  # 0.3
    _PARAMS_SOURCE = "import"
except Exception as _e:
    # fallback: ffmpeg_service.py L28~L37 에서 직접 확인한 값
    # (ImportError 외 pydantic ValidationError 등 설정 로드 오류도 포함)
    AFFTDN_NR   = 10
    AFFTDN_NF   = -25
    EQ_FREQ     = 2500
    EQ_WIDTH    = 200
    EQ_GAIN     = 3
    AECHO_IN    = 0.6
    AECHO_OUT   = 0.3
    AECHO_DELAY = 100
    AECHO_DECAY = 0.3
    _PARAMS_SOURCE = f"hardcoded-fallback (import err: {_e})"

# ---------------------------------------------------------------------------
# 판정 임계값 (plan §핵심 로직)
# ---------------------------------------------------------------------------
C3_VIABLE_SNR_DB   = 15.0  # degraded SNR ≥ 15.0 dB
C3_VIABLE_DIFF_DB  =  6.0  # snr_diff ≤ 6.0 dB (full - degraded)


# ---------------------------------------------------------------------------
# 합성 입력 (m0_dsp_self_test.py synth_voice_clip 동일 구현)
# ---------------------------------------------------------------------------

def synth_voice_clip(out_path: Path, freq_hz: int = 220, noise_db: int = -25) -> None:
    """voice-like 합성 클립 생성.
    sine sweep 220Hz + 백색 노이즈 -25dBFS, 30초.
    m0_dsp_self_test.py synth_voice_clip 과 동일 구현 (baseline 동등성).
    """
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=frequency={freq_hz}:duration={CLIP_DURATION_S}",
        "-f", "lavfi", "-i", f"anoisesrc=duration={CLIP_DURATION_S}:color=white:amplitude=0.05",
        "-filter_complex",
        "[0]volume=0.5[a];[1]volume=0.3[b];[a][b]amix=inputs=2:duration=shortest",
        "-ar", "44100", "-ac", "1",
        str(out_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"synth_voice_clip failed: {res.stderr[-300:]}")


# ---------------------------------------------------------------------------
# SNR 측정 (m0_dsp_self_test.py measure_noise_floor_db 동일 방식)
# ---------------------------------------------------------------------------

def measure_noise_floor_db(audio_path: Path) -> float:
    """ffmpeg astats=metadata=1:reset=1 로 RMS level dB 측정.
    m0_dsp_self_test.py measure_noise_floor_db 와 동일 방식.
    반환: float (dB). NaN = 측정 실패.
    """
    cmd = [
        "ffmpeg", "-i", str(audio_path),
        "-af", "astats=metadata=1:reset=1",
        "-f", "null", "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    rms_levels = re.findall(r"RMS level dB:\s*(-?\d+\.\d+)", res.stderr)
    if not rms_levels:
        return float("nan")
    rms_floats = [float(x) for x in rms_levels if float(x) != float("-inf")]
    return min(rms_floats) if rms_floats else float("nan")


# ---------------------------------------------------------------------------
# DSP chain 적용
# ---------------------------------------------------------------------------

def apply_full_chain(input_path: Path, output_path: Path) -> None:
    """서버 DspService._apply_individual_dsp 와 동일 ffmpeg filter chain 적용.
    파라미터: ffmpeg_service.py DspService 상수 그대로.
    """
    filter_chain = (
        f"afftdn=nr={AFFTDN_NR}:nf={AFFTDN_NF},"
        f"equalizer=f={EQ_FREQ}:width_type=h:width={EQ_WIDTH}:g={EQ_GAIN},"
        f"aecho={AECHO_IN}:{AECHO_OUT}:{AECHO_DELAY}:{AECHO_DECAY}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-af", filter_chain,
        str(output_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"apply_full_chain failed: {res.stderr[-400:]}")


def apply_degraded_chain(input_path: Path, output_path: Path, hp_cutoff_hz: int = 80) -> None:
    """afftdn 제거 + 1차 highpass IIR 대체 chain.
    filter: highpass=f={hp_cutoff_hz}:poles=1,equalizer=...,aecho=...
    EQ/echo 파라미터 = full_chain 과 동일.
    """
    filter_chain = (
        f"highpass=f={hp_cutoff_hz}:poles=1,"
        f"equalizer=f={EQ_FREQ}:width_type=h:width={EQ_WIDTH}:g={EQ_GAIN},"
        f"aecho={AECHO_IN}:{AECHO_OUT}:{AECHO_DELAY}:{AECHO_DECAY}"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-af", filter_chain,
        str(output_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"apply_degraded_chain failed: {res.stderr[-400:]}")


# ---------------------------------------------------------------------------
# SNR 개선량 계산
# ---------------------------------------------------------------------------

def compute_snr_improvement(raw_path: Path, processed_path: Path) -> float:
    """noise floor 개선량 (dB).
    abs(processed_floor - raw_floor).
    반환: float (양수 = 개선, 0 이하 = 악화/동등).
    """
    raw_floor = measure_noise_floor_db(raw_path)
    proc_floor = measure_noise_floor_db(processed_path)
    if raw_floor != raw_floor or proc_floor != proc_floor:  # NaN check
        return 0.0
    return abs(proc_floor - raw_floor)


# ---------------------------------------------------------------------------
# PNG 시각화 (matplotlib 미설치 시 SKIP_PNG)
# ---------------------------------------------------------------------------

def plot_comparison(
    raw_path: Path,
    full_chain_path: Path,
    degraded_chain_path: Path,
    output_png: Path,
) -> bool:
    """waveform 비교 PNG 3-row subplot 생성.
    반환: True = PNG 생성, False = SKIP_PNG (matplotlib 미설치).
    """
    try:
        import matplotlib  # noqa: F401
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError as e:
        print(f"WARNING: matplotlib 미설치 — PNG 생성 SKIP ({e})", file=sys.stderr)
        return False

    def load_wav_samples(path: Path):
        """ffmpeg 로 raw PCM float32 읽기."""
        cmd = [
            "ffmpeg", "-i", str(path),
            "-f", "f32le", "-acodec", "pcm_f32le",
            "-ar", "44100", "-ac", "1", "-",
        ]
        res = subprocess.run(cmd, capture_output=True)
        return np.frombuffer(res.stdout, dtype=np.float32)

    sr = 44100
    raw_samples = load_wav_samples(raw_path)
    full_samples = load_wav_samples(full_chain_path)
    degraded_samples = load_wav_samples(degraded_chain_path)

    t_raw = np.arange(len(raw_samples)) / sr
    t_full = np.arange(len(full_samples)) / sr
    t_deg = np.arange(len(degraded_samples)) / sr

    fig, axes = plt.subplots(3, 1, figsize=(12, 8), sharex=False)
    fig.suptitle("NS1 — afftdn 강등 perceptual diff", fontsize=13)

    axes[0].plot(t_raw[:sr * 5], raw_samples[:sr * 5], linewidth=0.4, color="steelblue")
    axes[0].set_title("raw (first 5s)")
    axes[0].set_ylabel("amplitude")

    axes[1].plot(t_full[:sr * 5], full_samples[:sr * 5], linewidth=0.4, color="darkorange")
    axes[1].set_title("full chain (afftdn + EQ + aecho)")
    axes[1].set_ylabel("amplitude")

    axes[2].plot(t_deg[:sr * 5], degraded_samples[:sr * 5], linewidth=0.4, color="seagreen")
    axes[2].set_title("degraded chain (highpass + EQ + aecho, afftdn 제거)")
    axes[2].set_ylabel("amplitude")
    axes[2].set_xlabel("time (s)")

    plt.tight_layout()
    plt.savefig(str(output_png), dpi=120)
    plt.close(fig)
    return True


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main() -> int:
    SPIKE_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # 환경 정보
    ffmpeg_ver_res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
    ffmpeg_ver_line = ffmpeg_ver_res.stdout.splitlines()[0] if ffmpeg_ver_res.stdout else "unknown"
    python_ver = f"Python {sys.version.split()[0]}"
    today = datetime.date.today().isoformat()

    print(f"환경: {ffmpeg_ver_line} / {python_ver}")
    print(f"파라미터 소스: {_PARAMS_SOURCE}")
    print(f"AFFTDN_NR={AFFTDN_NR}, AFFTDN_NF={AFFTDN_NF}")
    print(f"EQ_FREQ={EQ_FREQ}, EQ_WIDTH={EQ_WIDTH}, EQ_GAIN={EQ_GAIN}")
    print(f"AECHO_IN={AECHO_IN}, AECHO_OUT={AECHO_OUT}, AECHO_DELAY={AECHO_DELAY}, AECHO_DECAY={AECHO_DECAY}")

    with tempfile.TemporaryDirectory(prefix="ns1_spike_") as td:
        workdir = Path(td)

        raw_path      = workdir / "raw.wav"
        full_path     = workdir / "full_chain.wav"
        degraded_path = workdir / "degraded_chain.wav"

        # 입력 합성
        print("\n[1/4] synth_voice_clip ...")
        synth_voice_clip(raw_path)

        # 기준 noise floor (raw)
        raw_floor = measure_noise_floor_db(raw_path)
        print(f"  raw_floor_db = {raw_floor:.2f} dBFS")

        # STEP 1: full chain
        print("[2/4] apply_full_chain ...")
        apply_full_chain(raw_path, full_path)
        full_floor = measure_noise_floor_db(full_path)
        full_snr = abs(full_floor - raw_floor) if (full_floor == full_floor and raw_floor == raw_floor) else 0.0
        print(f"  full_chain_floor_db = {full_floor:.2f} dBFS  |  snr_improvement = {full_snr:.2f} dB")

        # STEP 2: degraded chain
        print("[3/4] apply_degraded_chain ...")
        apply_degraded_chain(raw_path, degraded_path)
        degraded_floor = measure_noise_floor_db(degraded_path)
        degraded_snr = abs(degraded_floor - raw_floor) if (degraded_floor == degraded_floor and raw_floor == raw_floor) else 0.0
        print(f"  degraded_chain_floor_db = {degraded_floor:.2f} dBFS  |  snr_improvement = {degraded_snr:.2f} dB")

        # STEP 3: 판정
        snr_diff = full_snr - degraded_snr
        degraded_snr_pass = degraded_snr >= C3_VIABLE_SNR_DB
        snr_diff_pass     = snr_diff <= C3_VIABLE_DIFF_DB
        c3_viable         = degraded_snr_pass and snr_diff_pass

        print(f"\n[비교]")
        print(f"  snr_diff = {snr_diff:.2f} dB  (full - degraded; 양수 = full 우위)")
        print(f"  degraded_snr_pass = {'YES' if degraded_snr_pass else 'NO'}  (≥{C3_VIABLE_SNR_DB} dB?)")
        print(f"  snr_diff_pass     = {'YES' if snr_diff_pass else 'NO'}  (≤{C3_VIABLE_DIFF_DB} dB?)")

        # STEP 4: PNG
        print("[4/4] plot_comparison ...")
        png_generated = plot_comparison(raw_path, full_path, degraded_path, PNG_PATH)

        # STEP 5: log 기록
        if c3_viable:
            result_line = "RESULT: C3 viable (SNR diff ≤ 6dB AND degraded SNR ≥ 15dB)"
        else:
            reasons = []
            if not degraded_snr_pass:
                reasons.append(f"degraded SNR {degraded_snr:.2f} < {C3_VIABLE_SNR_DB} dB")
            if not snr_diff_pass:
                reasons.append(f"SNR diff {snr_diff:.2f} > {C3_VIABLE_DIFF_DB} dB")
            result_line = f"RESULT: C3 NO_GO ({', '.join(reasons)})"

        log_lines = [
            "# Epic 19 NS1 — afftdn 강등 perceptual diff",
            f"측정일: {today}",
            f"환경: {ffmpeg_ver_line} / {python_ver}",
            f"파라미터 소스: {_PARAMS_SOURCE}",
            "",
            "[full chain]",
            f"raw_floor_db: {raw_floor:.2f} dBFS",
            f"full_chain_floor_db: {full_floor:.2f} dBFS",
            f"full_chain_snr_improvement: {full_snr:.2f} dB",
            "",
            "[degraded chain (afftdn 제거 + highpass IIR f=80Hz)]",
            f"degraded_chain_floor_db: {degraded_floor:.2f} dBFS",
            f"degraded_chain_snr_improvement: {degraded_snr:.2f} dB",
            "",
            "[비교]",
            f"snr_diff_db: {snr_diff:.2f} dB  (full - degraded; 양수 = full 우위)",
            f"c3_viable_threshold_snr: {C3_VIABLE_SNR_DB} dB",
            f"c3_viable_threshold_diff: {C3_VIABLE_DIFF_DB} dB",
            f"degraded_snr_pass: {'YES' if degraded_snr_pass else 'NO'}  (≥{C3_VIABLE_SNR_DB} dB?)",
            f"snr_diff_pass: {'YES' if snr_diff_pass else 'NO'}  (≤{C3_VIABLE_DIFF_DB} dB?)",
            "",
        ]

        if not png_generated:
            log_lines.append("SKIP_PNG (matplotlib 미설치)")
            log_lines.append("")

        log_lines.append(result_line)

        LOG_PATH.write_text("\n".join(log_lines) + "\n", encoding="utf-8")
        print(f"\nlog 저장: {LOG_PATH}")
        if png_generated:
            print(f"PNG 저장: {PNG_PATH}")
        else:
            print("PNG: SKIP_PNG (matplotlib 미설치)")

    print(f"\n{result_line}")
    return 0 if c3_viable else 1


if __name__ == "__main__":
    sys.exit(main())
