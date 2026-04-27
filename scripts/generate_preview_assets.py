"""
S07 미리듣기용 placeholder WAV 6개 생성.

PRD 207: 상업 녹음본 사용 금지. PD 멜로디(Brahms, Mozart, Schubert, 전통 민요)의
오프닝 phrase를 사인파+2nd 하모닉으로 합성. 30초/곡, 16kHz가 아닌 44.1kHz mono PCM.

출시 전 IMSLP/Musopen CC0 음원 또는 정식 라이선스로 교체 필요.

실행:
    python3 scripts/generate_preview_assets.py
출력:
    apps/api/static/previews/{key}_preview.wav (6개)
"""
import math
import struct
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "apps" / "api" / "static" / "previews"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 44100
DURATION_SEC = 30
BPM = 60
BEAT_DUR = 60.0 / BPM  # 1초/박

NOTES = {
    "C": 261.63, "D": 293.66, "E": 329.63, "F": 349.23, "G": 392.00,
    "A": 440.00, "B": 493.88, "c": 523.25, "d": 587.33, "e": 659.25,
    "f": 698.46, "g": 783.99,
}

LULLABIES = {
    "brahms":   ["G", "G", "c", "G", "G", "c", "G", "c", "e", "d", "c", "B", "A", "G"],
    "mozart":   ["C", "E", "G", "E", "C", "G", "C", "c", "G", "E", "C"],
    "schubert": ["F", "F", "A", "F", "G", "F", "C", "F", "A", "c", "A", "G", "F"],
    "twinkle":  ["C", "C", "G", "G", "A", "A", "G", "F", "F", "E", "E", "D", "D", "C"],
    "rockabye": ["F", "F", "A", "G", "F", "D", "F", "C", "F", "A", "G", "F"],
    "hush":     ["G", "G", "G", "E", "G", "G", "G", "E", "C", "D", "E", "D", "C"],
}


def synth_note(freq: float, dur_sec: float) -> list[int]:
    n_samples = int(SAMPLE_RATE * dur_sec)
    out = [0] * n_samples
    attack_t = 0.05
    release_t = 0.1
    for i in range(n_samples):
        t = i / SAMPLE_RATE
        attack = min(t / attack_t, 1.0)
        release = min((dur_sec - t) / release_t, 1.0)
        env = max(0.0, attack * release)
        val = (
            math.sin(2 * math.pi * freq * t) * 0.5
            + math.sin(2 * math.pi * freq * 2 * t) * 0.15
        )
        out[i] = int(val * env * 0.4 * 32767)
    return out


def synth_melody(notes: list[str], total_sec: float) -> list[int]:
    cycle: list[int] = []
    for note in notes:
        cycle.extend(synth_note(NOTES[note], BEAT_DUR))
    target = int(SAMPLE_RATE * total_sec)
    samples: list[int] = []
    while len(samples) < target:
        samples.extend(cycle)
    samples = samples[:target]
    fade = int(SAMPLE_RATE * 1.0)
    for i in range(fade):
        scale = i / fade
        samples[i] = int(samples[i] * scale)
        samples[-i - 1] = int(samples[-i - 1] * scale)
    return samples


def write_wav(path: Path, samples: list[int]) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        clamped = (max(-32768, min(32767, s)) for s in samples)
        w.writeframes(b"".join(struct.pack("<h", v) for v in clamped))


def main() -> int:
    for key, notes in LULLABIES.items():
        samples = synth_melody(notes, DURATION_SEC)
        path = OUT_DIR / f"{key}_preview.wav"
        write_wav(path, samples)
        print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
