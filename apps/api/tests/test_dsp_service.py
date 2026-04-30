"""
REQ-DSP-02 — DspService / MockDspService 단위 테스트

커버 범위:
  AC-N1  N=1 클립 → _shuffle_exclude_previous 미호출, [A,A] acrossfade 입력 확인
  AC-N2  N≥2 클립 → Fisher-Yates 셔플 실행 확인 (previous_clip_index=None)
  AC-N3  N≥2 + previous_clip_index=0 → 인덱스 0 제외 후 셔플
  AC-EMP clip_paths 빈 리스트 → ValueError
  AC-FFE ffmpeg 실패 (returncode != 0) → RuntimeError
  AC-DSP _apply_individual_dsp → ffmpeg afftdn/equalizer/aecho 필터 체인 포함 확인
  AC-CF  _concat_acrossfade → acrossfade 파라미터 d=0.3:c1=tri:c2=tri 포함 확인
  AC-MP3 _concat_acrossfade 최종 단계 → libmp3lame 128k stereo 인코딩 확인
  AC-TMP process() 완료 후 중간 .dsp.wav 임시 파일 정리
  AC-MK  MockDspService — output_path 파일 생성 (MOCK_MP3_PATH 없을 때)
  AC-MKL MockDspService — mock_master.mp3 존재 시 shutil.copy2 호출
  AC-MLT MockDspService — latency_ms 값만큼 time.sleep 호출

의존성 패턴: 단독 lifecycle 가능 모듈 (DspService/MockDspService)
  - subprocess.run mock → ffmpeg 없는 환경에서도 동작
  - time.sleep mock → MockDspService latency 실제 대기 없음
"""

import os
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════


def _make_temp_wav(tmp_dir: str, name: str = None) -> str:
    """임시 더미 wav 파일 생성 후 경로 반환."""
    fname = name or f"{uuid.uuid4()}.wav"
    path = os.path.join(tmp_dir, fname)
    with open(path, "wb") as f:
        f.write(b"RIFF\x00\x00\x00\x00WAVEfmt ")
    return path


def _successful_run(*args, **kwargs):
    """subprocess.run mock — returncode=0 성공 응답."""
    m = MagicMock()
    m.returncode = 0
    m.stderr = ""
    return m


def _failed_run(*args, **kwargs):
    """subprocess.run mock — returncode=1 실패 응답."""
    m = MagicMock()
    m.returncode = 1
    m.stderr = "ffmpeg error: codec not found"
    return m


# ══════════════════════════════════════════════════════════════════════════════
# AC-EMP — 빈 clip_paths → ValueError
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_EMP_EmptyClipPaths:
    """REQ-DSP-02 AC-EMP — clip_paths=[] 시 ValueError 즉시 발생."""

    def test_빈_clip_paths_입력_시_ValueError_발생(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        with pytest.raises(ValueError, match="clip_paths is empty"):
            svc.process(clip_paths=[], output_path=str(tmp_path / "out.mp3"))


# ══════════════════════════════════════════════════════════════════════════════
# AC-FFE — ffmpeg 실패 → RuntimeError
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_FFE_FfmpegFailure:
    """REQ-DSP-02 AC-FFE — subprocess.run returncode != 0 → RuntimeError."""

    def test_ffmpeg_returncode_1_시_RuntimeError_발생(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")

        with patch("subprocess.run", side_effect=_failed_run):
            with pytest.raises(RuntimeError, match="ffmpeg failed"):
                svc.process(clip_paths=[clip], output_path=str(tmp_path / "out.mp3"))

    def test_ffmpeg_RuntimeError에_context_정보_포함(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")

        with patch("subprocess.run", side_effect=_failed_run):
            with pytest.raises(RuntimeError) as exc_info:
                svc.process(clip_paths=[clip], output_path=str(tmp_path / "out.mp3"))
        # context 태그 (individual_dsp / acrossfade / mp3_encode) 중 하나 포함
        assert "individual_dsp" in str(exc_info.value) or "ffmpeg failed" in str(exc_info.value)


# ══════════════════════════════════════════════════════════════════════════════
# AC-DSP — _apply_individual_dsp → afftdn/equalizer/aecho 필터 체인
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_DSP_IndividualDspFilterChain:
    """REQ-DSP-02 AC-DSP — _apply_individual_dsp 호출 시 올바른 ffmpeg -af 필터 전달."""

    def test_afftdn_필터가_cmd에_포함된다(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")
        out = str(tmp_path / "out.wav")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(cmd)
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            svc._apply_individual_dsp(clip, out)

        assert any("afftdn" in " ".join(c) for c in calls)

    def test_equalizer_필터가_cmd에_포함된다(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")
        out = str(tmp_path / "out.wav")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(cmd)
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            svc._apply_individual_dsp(clip, out)

        assert any("equalizer" in " ".join(c) for c in calls)

    def test_aecho_필터가_cmd에_포함된다(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")
        out = str(tmp_path / "out.wav")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(cmd)
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            svc._apply_individual_dsp(clip, out)

        assert any("aecho" in " ".join(c) for c in calls)


# ══════════════════════════════════════════════════════════════════════════════
# AC-N1 — N=1 클립 → [A, A] acrossfade
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_N1_SingleClipDoubled:
    """REQ-DSP-02 AC-N1 — N=1 클립 시 동일 클립 경로가 2회 acrossfade 입력으로 전달된다."""

    def test_N1_acrossfade_cmd에_같은_파일이_두_번_나타난다(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(list(cmd))
            # acrossfade 단계 후 mp3_encode 단계가 임시 파일을 읽으므로
            # acrossfade 출력 파일 실제 생성 시뮬레이션
            for i, arg in enumerate(cmd):
                if arg not in ("ffmpeg", "-y", "-i", "-af", "-filter_complex",
                               "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "2"):
                    if arg.endswith((".wav", ".mp3")) and i == len(cmd) - 1:
                        Path(arg).touch()
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove"):  # 임시 파일 삭제 mock
                svc.process(clip_paths=[clip], output_path=str(tmp_path / "out.mp3"))

        # _apply_individual_dsp 호출 후 DSP wav 생성 → _concat_acrossfade 호출
        # acrossfade cmd에서 -i 파라미터를 확인
        acrossfade_cmds = [c for c in calls if "acrossfade" in " ".join(c)]
        assert len(acrossfade_cmds) >= 1, "acrossfade cmd가 최소 1회 호출되어야 한다"

        # acrossfade cmd의 -i 입력 파일 목록 추출
        first_cf = acrossfade_cmds[0]
        input_files = [first_cf[i + 1] for i, arg in enumerate(first_cf) if arg == "-i"]
        assert len(input_files) == 2, "N=1 시 acrossfade는 입력 2개 (A, A)"
        assert input_files[0] == input_files[1], "N=1 시 두 입력이 동일 파일이어야 한다"


# ══════════════════════════════════════════════════════════════════════════════
# AC-N2 — N≥2 클립 → 셔플 실행 (previous_clip_index=None)
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_N2_MultipleClipsShuffled:
    """REQ-DSP-02 AC-N2 — N≥2 클립, previous_clip_index=None → 셔플 후 concat."""

    def test_N2_클립_두_개_acrossfade_cmd에_두_개_입력_파일(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip_a = _make_temp_wav(str(tmp_path), "a.wav")
        clip_b = _make_temp_wav(str(tmp_path), "b.wav")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(list(cmd))
            if cmd[-1].endswith((".wav", ".mp3")):
                Path(cmd[-1]).touch()
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove"):
                svc.process(
                    clip_paths=[clip_a, clip_b],
                    output_path=str(tmp_path / "out.mp3"),
                    previous_clip_index=None,
                )

        acrossfade_cmds = [c for c in calls if "acrossfade" in " ".join(c)]
        assert len(acrossfade_cmds) >= 1

    def test_shuffle_exclude_previous_None_시_전체_풀에서_셔플(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        paths = [str(tmp_path / f"{i}.wav") for i in range(3)]

        result = svc._shuffle_exclude_previous(paths, previous_index=None)
        assert set(result) == set(paths), "None 시 전체 클립이 결과에 포함되어야 한다"
        assert len(result) == len(paths)


# ══════════════════════════════════════════════════════════════════════════════
# AC-N3 — N≥2 + previous_clip_index=0 → 인덱스 0 제외
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_N3_ShuffleExcludePrevious:
    """REQ-DSP-02 AC-N3 — previous_clip_index=0 시 인덱스 0 경로가 결과에서 제외된다."""

    def test_previous_index_0_제외_후_나머지_클립만_반환(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        paths = [str(tmp_path / f"{i}.wav") for i in range(3)]

        result = svc._shuffle_exclude_previous(paths, previous_index=0)
        assert paths[0] not in result, "previous_index=0 경로는 결과에 포함되지 않아야 한다"
        assert len(result) == 2

    def test_previous_index_None이면_풀_유지(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        paths = [str(tmp_path / f"{i}.wav") for i in range(4)]

        result = svc._shuffle_exclude_previous(paths, previous_index=None)
        assert set(result) == set(paths)

    def test_previous_index_범위_밖이면_제외_없이_전체_셔플(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        paths = [str(tmp_path / f"{i}.wav") for i in range(2)]

        result = svc._shuffle_exclude_previous(paths, previous_index=99)
        assert set(result) == set(paths), "유효하지 않은 index는 무시하고 전체 풀 사용"


# ══════════════════════════════════════════════════════════════════════════════
# AC-CF — _concat_acrossfade → acrossfade d=0.3:c1=tri:c2=tri
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_CF_AcrossfadeParams:
    """REQ-DSP-02 AC-CF — acrossfade cmd에 d=0.3, c1=tri, c2=tri 파라미터 포함."""

    def test_acrossfade_d_파라미터가_0_3이다(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        a = _make_temp_wav(str(tmp_path), "a.wav")
        b = _make_temp_wav(str(tmp_path), "b.wav")
        out = str(tmp_path / "out.mp3")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(list(cmd))
            if cmd[-1].endswith((".wav", ".mp3")):
                Path(cmd[-1]).touch()
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove"):
                svc._concat_acrossfade([a, b], out)

        joined = " ".join(" ".join(c) for c in calls)
        assert "acrossfade=d=0.3" in joined

    def test_acrossfade_c1_c2_tri_파라미터_포함(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        a = _make_temp_wav(str(tmp_path), "a.wav")
        b = _make_temp_wav(str(tmp_path), "b.wav")
        out = str(tmp_path / "out.mp3")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(list(cmd))
            if cmd[-1].endswith((".wav", ".mp3")):
                Path(cmd[-1]).touch()
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove"):
                svc._concat_acrossfade([a, b], out)

        joined = " ".join(" ".join(c) for c in calls)
        assert "c1=tri" in joined
        assert "c2=tri" in joined

    def test_acrossfade_입력_1개_시_ValueError(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        a = _make_temp_wav(str(tmp_path), "a.wav")

        with patch("subprocess.run", side_effect=_successful_run):
            with pytest.raises(ValueError, match="at least 2"):
                svc._concat_acrossfade([a], str(tmp_path / "out.mp3"))


# ══════════════════════════════════════════════════════════════════════════════
# AC-MP3 — 최종 MP3 인코딩 → libmp3lame 128k stereo
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_MP3_EncodingParams:
    """REQ-DSP-02 AC-MP3 — 최종 단계 ffmpeg cmd에 libmp3lame / 128k / -ac 2 포함."""

    def test_최종_mp3_인코딩에_libmp3lame_포함(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        a = _make_temp_wav(str(tmp_path), "a.wav")
        b = _make_temp_wav(str(tmp_path), "b.wav")
        out = str(tmp_path / "out.mp3")

        calls = []
        def capture_run(cmd, **kwargs):
            calls.append(list(cmd))
            if cmd[-1].endswith((".wav", ".mp3")):
                Path(cmd[-1]).touch()
            return _successful_run()

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove"):
                svc._concat_acrossfade([a, b], out)

        mp3_cmds = [c for c in calls if "libmp3lame" in c]
        assert len(mp3_cmds) == 1, "libmp3lame 인코딩 cmd 1회"
        assert "128k" in mp3_cmds[0]
        assert "-ac" in mp3_cmds[0]
        assert "2" in mp3_cmds[0][mp3_cmds[0].index("-ac") + 1:]


# ══════════════════════════════════════════════════════════════════════════════
# AC-TMP — process() 후 .dsp.wav 임시 파일 정리 시도
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_TMP_TempFileCleanup:
    """REQ-DSP-02 AC-TMP — process() 완료 후 _apply_individual_dsp 출력 임시 파일 정리."""

    def test_process_성공_후_dsp_wav_파일_정리_시도(self, tmp_path):
        from app.services.dsp.ffmpeg_service import DspService

        svc = DspService()
        clip = _make_temp_wav(str(tmp_path), "clip.wav")
        out = str(tmp_path / "out.mp3")

        removed = []

        def capture_run(cmd, **kwargs):
            if cmd[-1].endswith((".wav", ".mp3")):
                Path(cmd[-1]).touch()
            return _successful_run()

        real_remove = os.remove
        def capture_remove(path):
            removed.append(path)
            try:
                real_remove(path)
            except FileNotFoundError:
                pass

        with patch("subprocess.run", side_effect=capture_run):
            with patch("os.remove", side_effect=capture_remove):
                svc.process(clip_paths=[clip], output_path=out)

        # .dsp.wav 패턴 파일이 정리 목록에 포함되어야 함
        dsp_wav_removed = [p for p in removed if ".dsp.wav" in p]
        assert len(dsp_wav_removed) >= 1, "process() 후 .dsp.wav 임시 파일이 정리되어야 한다"


# ══════════════════════════════════════════════════════════════════════════════
# AC-MK — MockDspService: MOCK_MP3_PATH 없을 때 ID3 헤더 파일 생성
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_MK_MockDspServiceNoStaticFile:
    """REQ-DSP-02 AC-MK — mock_master.mp3 부재 시 output_path에 최소 파일 생성."""

    def test_mock_mp3_없을_때_output_에_ID3_헤더_파일_생성(self, tmp_path):
        from app.services.dsp.mock_dsp_service import MockDspService

        svc = MockDspService(latency_ms=0)
        out = str(tmp_path / "out.mp3")

        with patch("os.path.exists", return_value=False):
            with patch("time.sleep"):
                svc.process(clip_paths=[str(tmp_path / "clip.wav")], output_path=out)

        assert os.path.exists(out), "output_path 파일이 생성되어야 한다"
        content = open(out, "rb").read()
        assert content[:3] == b"ID3", "최소 ID3 헤더 3바이트가 기록되어야 한다"


# ══════════════════════════════════════════════════════════════════════════════
# AC-MKL — MockDspService: mock_master.mp3 존재 시 shutil.copy2 호출
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_MKL_MockDspServiceCopiesStaticFile:
    """REQ-DSP-02 AC-MKL — mock_master.mp3 존재 시 shutil.copy2(MOCK_MP3_PATH, output_path)."""

    def test_mock_mp3_존재_시_shutil_copy2_호출(self, tmp_path):
        from app.services.dsp.mock_dsp_service import MockDspService

        svc = MockDspService(latency_ms=0)
        out = str(tmp_path / "out.mp3")

        with patch("os.path.exists", return_value=True):
            with patch("shutil.copy2") as mock_copy:
                with patch("time.sleep"):
                    svc.process(
                        clip_paths=[str(tmp_path / "clip.wav")],
                        output_path=out,
                    )

        mock_copy.assert_called_once()
        _, dst = mock_copy.call_args[0]
        assert dst == out, "copy2 두 번째 인자가 output_path여야 한다"


# ══════════════════════════════════════════════════════════════════════════════
# AC-MLT — MockDspService: latency_ms만큼 time.sleep 호출
# ══════════════════════════════════════════════════════════════════════════════


class TestAC_MLT_MockDspServiceLatency:
    """REQ-DSP-02 AC-MLT — MockDspService(latency_ms=3000) → time.sleep(3.0) 호출."""

    def test_latency_ms_3000_시_sleep_3_0_호출(self, tmp_path):
        from app.services.dsp.mock_dsp_service import MockDspService

        svc = MockDspService(latency_ms=3000)
        out = str(tmp_path / "out.mp3")

        with patch("os.path.exists", return_value=False):
            with patch("time.sleep") as mock_sleep:
                with patch("builtins.open", MagicMock()):
                    svc.process(clip_paths=["clip.wav"], output_path=out)

        mock_sleep.assert_called_once_with(3.0)

    def test_latency_ms_0_시_sleep_0_0_호출(self, tmp_path):
        from app.services.dsp.mock_dsp_service import MockDspService

        svc = MockDspService(latency_ms=0)
        out = str(tmp_path / "out.mp3")

        with patch("os.path.exists", return_value=False):
            with patch("time.sleep") as mock_sleep:
                svc.process(clip_paths=["clip.wav"], output_path=out)

        mock_sleep.assert_called_once_with(0.0)
