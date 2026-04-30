import subprocess
import tempfile
import os
import random
import structlog
from pathlib import Path

logger = structlog.get_logger()


class DspService:
    """
    ffmpeg 기반 DSP 후처리 파이프라인.

    파이프라인 순서 (클립 1개 기준):
    1. afftdn — 적응형 노이즈 제거
    2. equalizer — EQ (음성 주파수 강조)
    3. aecho — reverb (부드러운 공간감)

    concat 단계:
    4. N=1: [A, A] acrossfade (단순 반복 crossfade)
       N≥2: Fisher-Yates 직전 제외 셔플 → acrossfade 체인

    출력: MP3 128kbps stereo, 약 3분 (loop 단위 클립)
    """

    # DSP 파라미터 상수 (M0 self-test 튜닝 값으로 교체 예정)
    AFFTDN_NR   = 10         # noise reduction (dB)
    AFFTDN_NF   = -25        # noise floor (dBFS)
    EQ_FREQ     = 2500       # 음성 명료도 강조 주파수
    EQ_WIDTH    = 200
    EQ_GAIN     = 3          # +3dB
    AECHO_IN    = 0.6
    AECHO_OUT   = 0.3
    AECHO_DELAY = 100        # ms
    AECHO_DECAY = 0.3
    CROSSFADE_D = 0.3        # 300ms crossfade (acrossfade d 파라미터)
    CROSSFADE_C = "tri"      # c1, c2 커브 타입

    def process(
        self,
        clip_paths: list[str],       # S3에서 다운로드된 로컬 경로 목록
        output_path: str,            # master.mp3 출력 경로
        previous_clip_index: int | None = None,  # 직전 재생 클립 인덱스 (셔플 제외용)
    ) -> None:
        """
        DSP 처리 + concat → output_path에 master.mp3 저장.
        실패 시 subprocess.CalledProcessError 또는 RuntimeError 발생.
        """
        if not clip_paths:
            raise ValueError("clip_paths is empty")

        # Step 1~3: 각 클립 개별 DSP
        processed_paths = []
        for clip_path in clip_paths:
            out_path = clip_path + ".dsp.wav"
            self._apply_individual_dsp(clip_path, out_path)
            processed_paths.append(out_path)

        # Step 4: 셔플 + concat + acrossfade
        if len(processed_paths) == 1:
            ordered = [processed_paths[0], processed_paths[0]]  # N=1: A,A
        else:
            ordered = self._shuffle_exclude_previous(processed_paths, previous_clip_index)

        self._concat_acrossfade(ordered, output_path)

        # 임시 DSP 중간 파일 정리
        for p in processed_paths:
            try:
                os.remove(p)
            except FileNotFoundError:
                pass

    def _apply_individual_dsp(self, input_path: str, output_path: str) -> None:
        """단일 클립 DSP: afftdn → equalizer → aecho."""
        filter_chain = (
            f"afftdn=nr={self.AFFTDN_NR}:nf={self.AFFTDN_NF},"
            f"equalizer=f={self.EQ_FREQ}:width_type=h:width={self.EQ_WIDTH}:g={self.EQ_GAIN},"
            f"aecho={self.AECHO_IN}:{self.AECHO_OUT}:{self.AECHO_DELAY}:{self.AECHO_DECAY}"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-af", filter_chain,
            output_path,
        ]
        self._run_ffmpeg(cmd, context="individual_dsp")

    def _shuffle_exclude_previous(
        self,
        paths: list[str],
        previous_index: int | None,
    ) -> list[str]:
        """
        N≥2 Fisher-Yates 직전 제외 셔플.
        previous_index=None 이면 셔플만 (제외 없음).
        반환: acrossfade concat 순서 리스트.
        """
        pool = list(range(len(paths)))
        if previous_index is not None and previous_index in pool:
            pool.remove(previous_index)

        random.shuffle(pool)

        # 생성된 순서 인덱스로 실제 경로 매핑
        return [paths[i] for i in pool]

    def _concat_acrossfade(self, ordered_paths: list[str], output_path: str) -> None:
        """
        acrossfade 체인 concat.
        ffmpeg -i A -i B -filter_complex "[0][1]acrossfade=d=0.3:c1=tri:c2=tri" output.mp3
        N>2: 체인 방식 (A→B acrossfade → result, result→C acrossfade → final)
        """
        if len(ordered_paths) < 2:
            raise ValueError("acrossfade requires at least 2 inputs")

        # 순차 2-파일 acrossfade 체인
        current = ordered_paths[0]
        for next_clip in ordered_paths[1:]:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            cmd = [
                "ffmpeg", "-y",
                "-i", current,
                "-i", next_clip,
                "-filter_complex",
                f"[0][1]acrossfade=d={self.CROSSFADE_D}:c1={self.CROSSFADE_C}:c2={self.CROSSFADE_C}",
                tmp_path,
            ]
            self._run_ffmpeg(cmd, context="acrossfade")
            if current != ordered_paths[0]:
                # 중간 임시 파일 정리 (첫 번째는 원본이므로 보존)
                try:
                    os.remove(current)
                except FileNotFoundError:
                    pass
            current = tmp_path

        # 최종 파일 → MP3 128kbps 인코딩
        cmd = [
            "ffmpeg", "-y",
            "-i", current,
            "-codec:a", "libmp3lame",
            "-b:a", "128k",
            "-ac", "2",      # stereo
            output_path,
        ]
        self._run_ffmpeg(cmd, context="mp3_encode")
        try:
            os.remove(current)
        except FileNotFoundError:
            pass

    @staticmethod
    def _run_ffmpeg(cmd: list[str], context: str) -> None:
        logger.debug("ffmpeg.run", context=context, cmd=" ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            logger.error("ffmpeg.failed", context=context, stderr=result.stderr)
            raise RuntimeError(f"ffmpeg failed [{context}]: {result.stderr[-500:]}")
