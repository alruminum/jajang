"""M0 DSP self-test runner.

`backlog.md` M0 checklist 4 항목 실측:
1. ffmpeg DSP 파이프라인 프로토타입 실행 (afftdn/equalizer/aecho/acrossfade)
2. 합격 기준 3항목: 단조로움(셔플 효과) / 이음새(crossfade 무음 없음) / 노이즈(SNR 15dB 이상)
3. cold start 포함 end-to-end latency 30초 이내
4. 실패 contingency: 단조로움→셔플 재설계 / 이음새→crossfade 길이 조정 / 노이즈→필터 파라미터 재조정

실행:
    cd apps/api && .venv/bin/python scripts/m0_dsp_self_test.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

# DspService import (PYTHONPATH unaware → 수동 sys.path 추가)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services.dsp.ffmpeg_service import DspService  # noqa: E402


CLIP_DURATION_S = 30  # 녹음 1 loop 길이 (PRD §F2)
NUM_CLIPS = 4
SHUFFLE_TRIALS = 10
SILENCE_THRESHOLD_DB = -50
SILENCE_MIN_DURATION_S = 0.1
SNR_PASS_DB = 15.0
LATENCY_PASS_S = 30.0


def synth_voice_clip(out_path: Path, freq_hz: int = 220, noise_db: int = -25) -> None:
    """voice-like 합성 클립 생성.
    sine sweep 220-440Hz + 백색 노이즈 -25dBFS, 30초.
    실제 voice 의 SNR 측정 환경 모사.
    """
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"sine=frequency={freq_hz}:duration={CLIP_DURATION_S}",
        "-f", "lavfi", "-i", f"anoisesrc=duration={CLIP_DURATION_S}:color=white:amplitude=0.05",
        "-filter_complex",
        f"[0]volume=0.5[a];[1]volume=0.3[b];[a][b]amix=inputs=2:duration=shortest",
        "-ar", "44100", "-ac", "1",
        str(out_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"synth_voice_clip failed: {res.stderr[-300:]}")


def measure_noise_floor_db(audio_path: Path) -> float:
    """ffprobe astats 로 RMS noise floor (dB) 측정.
    afftdn 적용 전/후 비교용. 낮을수록 노이즈 적음.
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


def detect_silence_periods(audio_path: Path) -> list[tuple[float, float]]:
    """silencedetect 로 무음 구간 추출."""
    cmd = [
        "ffmpeg", "-i", str(audio_path),
        "-af", f"silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d={SILENCE_MIN_DURATION_S}",
        "-f", "null", "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    starts = re.findall(r"silence_start:\s*(-?\d+\.\d+)", res.stderr)
    durations = re.findall(r"silence_duration:\s*(\d+\.\d+)", res.stderr)
    return list(zip([float(s) for s in starts], [float(d) for d in durations]))


def get_duration_s(audio_path: Path) -> float:
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return float(res.stdout.strip())


def run_test_1_pipeline(workdir: Path) -> dict:
    """Test 1: 파이프라인 프로토타입 실행 — N=4 클립 1회 처리 + 결과 검증."""
    print("\n=== Test 1: 파이프라인 프로토타입 (N=4) ===")
    clips = []
    for i in range(NUM_CLIPS):
        clip = workdir / f"clip_{i}.wav"
        synth_voice_clip(clip, freq_hz=220 + i * 30)
        clips.append(str(clip))

    output = workdir / "master_t1.mp3"
    svc = DspService()
    t0 = time.perf_counter()
    svc.process(clips, str(output), previous_clip_index=None)
    elapsed = time.perf_counter() - t0

    out_duration = get_duration_s(output)
    out_size = output.stat().st_size

    return {
        "input_clips": NUM_CLIPS,
        "input_duration_s": CLIP_DURATION_S,
        "output_duration_s": round(out_duration, 2),
        "output_size_bytes": out_size,
        "elapsed_s": round(elapsed, 2),
        "pass": output.exists() and out_size > 0,
    }


def run_test_2_silence(workdir: Path) -> dict:
    """Test 2: crossfade 무음 검출 (이음새 합격 기준)."""
    print("\n=== Test 2: crossfade 무음 (이음새) ===")
    output = workdir / "master_t1.mp3"
    silences = detect_silence_periods(output)
    out_duration = get_duration_s(output)

    # mid-track 만 검사 — 시작 0.5s + 끝 0.5s 는 encoder tail/fade-out 영역
    mid_silences = [
        (s, d) for s, d in silences
        if s > 0.5 and (s + d) < (out_duration - 0.5)
    ]

    return {
        "silence_periods": silences,
        "output_duration_s": round(out_duration, 2),
        "mid_track_silence_count": len(mid_silences),
        "pass": len(mid_silences) == 0,
    }


def run_test_3_snr(workdir: Path) -> dict:
    """Test 3: 노이즈 감소 — afftdn 전/후 noise floor 비교."""
    print("\n=== Test 3: SNR (afftdn 효과) ===")
    raw_clip = workdir / "snr_raw.wav"
    synth_voice_clip(raw_clip, freq_hz=220)

    raw_floor = measure_noise_floor_db(raw_clip)

    # afftdn 단독 적용
    dsp_only = workdir / "snr_dsp.wav"
    svc = DspService()
    svc._apply_individual_dsp(str(raw_clip), str(dsp_only))
    dsp_floor = measure_noise_floor_db(dsp_only)

    # SNR 개선분 = raw 대비 dsp 의 noise floor 감소량 (RMS 차이)
    improvement = abs(dsp_floor - raw_floor) if not (
        any(x != x for x in (raw_floor, dsp_floor))  # NaN check
    ) else 0.0

    return {
        "raw_floor_db": round(raw_floor, 2),
        "dsp_floor_db": round(dsp_floor, 2),
        "improvement_db": round(improvement, 2),
        "pass_threshold_db": SNR_PASS_DB,
        "pass": improvement >= SNR_PASS_DB,
    }


def run_test_4_shuffle(workdir: Path) -> dict:
    """Test 4: 단조로움 — 셔플 다양성 검증."""
    print("\n=== Test 4: 단조로움 (셔플 다양성) ===")
    paths = [f"/tmp/clip{i}.wav" for i in range(NUM_CLIPS)]
    svc = DspService()

    orderings: list[tuple[str, ...]] = []
    for _ in range(SHUFFLE_TRIALS):
        result = svc._shuffle_exclude_previous(paths, previous_index=0)
        orderings.append(tuple(result))

    unique_count = len(set(orderings))
    counter = Counter(orderings)
    top = counter.most_common(3)
    top_freq = top[0][1] if top else 0
    max_pool = NUM_CLIPS - 1  # previous 제외
    max_perms = 1
    for k in range(1, max_pool + 1):
        max_perms *= k

    # 합격 기준: 최빈 ordering 빈도 ≤ 50% (단일 ordering 지배 X)
    dominance_ratio = top_freq / SHUFFLE_TRIALS

    return {
        "trials": SHUFFLE_TRIALS,
        "previous_excluded_index": 0,
        "max_possible_orderings": max_perms,
        "unique_orderings": unique_count,
        "top_3_distribution": [(list(k), v) for k, v in top],
        "top_dominance_ratio": round(dominance_ratio, 2),
        "pass_threshold": "최빈 ordering 빈도 ≤ 50%",
        "pass": dominance_ratio <= 0.5,
    }


def run_test_5_latency(workdir: Path) -> dict:
    """Test 5: cold start 포함 end-to-end latency."""
    print("\n=== Test 5: latency (cold + warm) ===")
    clips = []
    for i in range(NUM_CLIPS):
        clip = workdir / f"lat_clip_{i}.wav"
        synth_voice_clip(clip, freq_hz=220 + i * 20)
        clips.append(str(clip))

    svc = DspService()

    # cold
    out1 = workdir / "lat_master_cold.mp3"
    t0 = time.perf_counter()
    svc.process(clips, str(out1), previous_clip_index=None)
    cold = time.perf_counter() - t0

    # warm (process 인스턴스 재사용)
    out2 = workdir / "lat_master_warm.mp3"
    t0 = time.perf_counter()
    svc.process(clips, str(out2), previous_clip_index=None)
    warm = time.perf_counter() - t0

    return {
        "cold_start_s": round(cold, 2),
        "warm_run_s": round(warm, 2),
        "pass_threshold_s": LATENCY_PASS_S,
        "pass": cold < LATENCY_PASS_S and warm < LATENCY_PASS_S,
    }


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="m0_dsp_") as td:
        workdir = Path(td)

        results = {
            "test_1_pipeline": run_test_1_pipeline(workdir),
            "test_2_silence": run_test_2_silence(workdir),
            "test_3_snr": run_test_3_snr(workdir),
            "test_4_shuffle": run_test_4_shuffle(workdir),
            "test_5_latency": run_test_5_latency(workdir),
        }

    print("\n=== Results ===")
    print(json.dumps(results, indent=2, ensure_ascii=False))

    all_pass = all(r["pass"] for r in results.values())
    print(f"\nOverall: {'PASS' if all_pass else 'FAIL'}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
