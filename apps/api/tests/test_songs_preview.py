"""
#116 — MOCK_S3 미리듣기 분기 테스트

대상: apps/api/app/services/songs_service.get_preview_url
수용 기준: docs/bugfix/#116-mock-s3-preview.md
"""

import pytest
from unittest.mock import patch, MagicMock

from app.services.songs_service import get_preview_url


# ── 상수 ─────────────────────────────────────────────────────────────────────
ALL_SONG_KEYS = ["brahms", "mozart", "schubert", "twinkle", "rockabye", "hush"]


# ── 픽스처: MOCK_S3=true 환경 ─────────────────────────────────────────────────
@pytest.fixture
def mock_s3_on(monkeypatch):
    """settings.MOCK_S3 = True로 강제 설정."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", True)


@pytest.fixture
def mock_s3_off(monkeypatch):
    """settings.MOCK_S3 = False로 강제 설정."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", False)


# ── REQ-MOCK-URL: 로컬 .wav URL 형식 검증 ─────────────────────────────────────
class TestMockS3PreviewUrl:
    """MOCK_S3=true 시 로컬 /static URL을 반환해야 한다 (6곡 전체)."""

    @pytest.mark.parametrize("song_key", ALL_SONG_KEYS)
    def test_preview_url_형식이_localhost_static_경로여야_한다(self, mock_s3_on, song_key):
        """REQ-MOCK-URL: MOCK_S3=true → http://localhost:8000/static/previews/{key}_preview.wav"""
        result = get_preview_url(song_key)

        expected = f"http://localhost:8000/static/previews/{song_key}_preview.wav"
        assert result.preview_url == expected

    @pytest.mark.parametrize("song_key", ALL_SONG_KEYS)
    def test_preview_url_확장자가_wav여야_한다(self, mock_s3_on, song_key):
        """REQ-WAV-EXT: .mp3 회귀 방지 — URL이 .wav로 끝나야 한다."""
        result = get_preview_url(song_key)

        assert result.preview_url.endswith(".wav"), (
            f"확장자가 .wav가 아님: {result.preview_url!r} (.mp3 회귀 가능성)"
        )

    @pytest.mark.parametrize("song_key", ALL_SONG_KEYS)
    def test_preview_url_에_mp3_확장자가_없어야_한다(self, mock_s3_on, song_key):
        """REQ-WAV-EXT: .mp3가 URL에 포함되면 안 된다 (버그 #116 회귀 방지)."""
        result = get_preview_url(song_key)

        assert ".mp3" not in result.preview_url


# ── REQ-MOCK-EXPIRES: expires_in_seconds == 0 ────────────────────────────────
class TestMockS3ExpiresInSeconds:
    """MOCK_S3=true 시 expires_in_seconds가 0이어야 한다 (만료 없음 시그널)."""

    @pytest.mark.parametrize("song_key", ALL_SONG_KEYS)
    def test_expires_in_seconds가_0이어야_한다(self, mock_s3_on, song_key):
        """REQ-MOCK-EXPIRES: mock URL은 만료가 없으므로 expires_in_seconds == 0."""
        result = get_preview_url(song_key)

        assert result.expires_in_seconds == 0


# ── REQ-MOCK-KEY: song_key 응답 보존 ─────────────────────────────────────────
class TestMockS3SongKeyPreserved:
    """MOCK_S3=true 시 응답의 song_key가 입력과 일치해야 한다."""

    @pytest.mark.parametrize("song_key", ALL_SONG_KEYS)
    def test_응답_song_key가_입력과_일치해야_한다(self, mock_s3_on, song_key):
        """REQ-MOCK-KEY: PreviewUrlResponse.song_key == 입력 song_key."""
        result = get_preview_url(song_key)

        assert result.song_key == song_key


# ── REQ-S3-BOTO3: MOCK_S3=false → boto3 presigned URL 경로 ──────────────────
class TestS3PresignedMode:
    """MOCK_S3=false 시 boto3 generate_presigned_url을 호출해야 한다."""

    def test_boto3_generate_presigned_url이_호출되어야_한다(self, mock_s3_off):
        """REQ-S3-BOTO3: MOCK_S3=false → boto3.client().generate_presigned_url 호출 확인."""
        fake_url = "https://s3.example.com/presigned-url"
        mock_s3_client = MagicMock()
        mock_s3_client.generate_presigned_url.return_value = fake_url

        with patch("app.services.songs_service.boto3.client", return_value=mock_s3_client):
            result = get_preview_url("brahms")

        mock_s3_client.generate_presigned_url.assert_called_once()

    def test_boto3_presigned_url이_응답에_포함되어야_한다(self, mock_s3_off):
        """REQ-S3-BOTO3: MOCK_S3=false → 반환 URL이 boto3 presigned URL이어야 한다."""
        fake_url = "https://s3.example.com/presigned-url"
        mock_s3_client = MagicMock()
        mock_s3_client.generate_presigned_url.return_value = fake_url

        with patch("app.services.songs_service.boto3.client", return_value=mock_s3_client):
            result = get_preview_url("brahms")

        assert result.preview_url == fake_url

    def test_boto3_presigned_expires_in_seconds가_0이_아니어야_한다(self, mock_s3_off):
        """REQ-S3-BOTO3: MOCK_S3=false → expires_in_seconds는 실제 만료 시간(>0)이어야 한다."""
        mock_s3_client = MagicMock()
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/url"

        with patch("app.services.songs_service.boto3.client", return_value=mock_s3_client):
            result = get_preview_url("brahms")

        assert result.expires_in_seconds > 0

    def test_boto3_get_object_params_에_Bucket과_Key가_포함되어야_한다(self, mock_s3_off):
        """REQ-S3-BOTO3: boto3 호출 시 Params에 Bucket·Key가 모두 있어야 한다."""
        mock_s3_client = MagicMock()
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/url"

        with patch("app.services.songs_service.boto3.client", return_value=mock_s3_client):
            get_preview_url("brahms")

        call_kwargs = mock_s3_client.generate_presigned_url.call_args
        params = call_kwargs[1].get("Params") or call_kwargs[0][1]
        assert "Bucket" in params
        assert "Key" in params


# ── REQ-INVALID: 무효 song_key → ValueError ───────────────────────────────────
class TestInvalidSongKey:
    """존재하지 않는 song_key는 ValueError를 발생시켜야 한다."""

    def test_존재하지_않는_key는_ValueError가_발생해야_한다(self):
        """REQ-INVALID: unknown song_key → ValueError."""
        with pytest.raises(ValueError):
            get_preview_url("nonexistent")

    def test_ValueError_메시지에_key_정보가_포함되어야_한다(self):
        """REQ-INVALID: ValueError 메시지에 'Unknown song_key' 문자열 포함."""
        with pytest.raises(ValueError, match="Unknown song_key"):
            get_preview_url("nonexistent")

    def test_빈_문자열_key는_ValueError가_발생해야_한다(self):
        """REQ-INVALID: 빈 문자열도 무효 key로 처리되어야 한다."""
        with pytest.raises(ValueError):
            get_preview_url("")

    def test_대소문자_다른_key는_ValueError가_발생해야_한다(self):
        """REQ-INVALID: 'Brahms'(대문자)는 'brahms'와 다른 key로 처리되어야 한다."""
        with pytest.raises(ValueError):
            get_preview_url("Brahms")
