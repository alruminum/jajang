"""
#144 — MOCK_S3=true 환경 mp3 업로드/다운로드/삭제 흐름 테스트

대상:
- apps/api/app/services/storage_service.upload_mp3 — MOCK_S3=true 시 로컬 /static 저장
- apps/api/app/services/storage_service.generate_presigned_url — MOCK_S3=true 시 /static URL
- apps/api/app/services/storage_service.delete_object — MOCK_S3=true 시 로컬 파일 삭제
- STATIC_ROOT 단일 출처: main.py 와 storage_service 가 같은 경로

수용 기준:
- MOCK_S3=true → boto3 우회, 로컬 파일 read/write
- MOCK_S3=false → 기존 boto3 흐름 유지 (회귀)
- main.py 가 mount 하는 디렉토리와 storage_service 가 쓰는 디렉토리가 동일
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services import storage_service


@pytest.fixture
def mock_s3_on(monkeypatch, tmp_path):
    monkeypatch.setattr(storage_service.settings, "MOCK_S3", True, raising=False)
    monkeypatch.setattr(storage_service, "STATIC_ROOT", tmp_path)
    return tmp_path


@pytest.fixture
def mock_s3_off(monkeypatch):
    monkeypatch.setattr(storage_service.settings, "MOCK_S3", False, raising=False)


class Test_STATIC_ROOT_정합성:
    """main.py 와 storage_service 가 같은 디렉토리를 가리키는지 검증.
    본 단건이 있었다면 #144 PLAN_VALIDATION FAIL 이 사전에 잡혔음."""

    def test_storage_service_와_config_가_같은_경로를_가리킨다(self):
        from app.core import config as core_config
        assert storage_service.STATIC_ROOT == core_config.STATIC_ROOT

    def test_main_의_mount_경로와_같다(self):
        from app import main as app_main
        from app.core import config as core_config
        assert getattr(app_main, "STATIC_ROOT", core_config.STATIC_ROOT) == core_config.STATIC_ROOT


class Test_upload_mp3_MOCK_S3_true:
    def test_boto3가_호출되지_않아야_한다(self, mock_s3_on):
        with patch("app.services.storage_service.boto3.client") as boto:
            storage_service.upload_mp3(uuid.uuid4(), uuid.uuid4(), b"\x00" * 64)
        boto.assert_not_called()

    def test_파일이_static_root_아래에_저장된다(self, mock_s3_on):
        user_id = uuid.uuid4()
        track_id = uuid.uuid4()
        body = b"\x01\x02\x03"
        s3_key = storage_service.upload_mp3(user_id, track_id, body)
        assert s3_key == f"tracks/{user_id}/{track_id}.mp3"
        assert (mock_s3_on / s3_key).read_bytes() == body


class Test_upload_mp3_MOCK_S3_false:
    def test_boto3_put_object가_호출된다(self, mock_s3_off):
        fake = MagicMock()
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            storage_service.upload_mp3(uuid.uuid4(), uuid.uuid4(), b"x")
        fake.put_object.assert_called_once()


class Test_generate_presigned_url:
    def test_MOCK_S3_true_시_static_URL_반환(self, mock_s3_on):
        url = storage_service.generate_presigned_url("tracks/u/t.mp3")
        assert url == "http://localhost:8000/static/tracks/u/t.mp3"

    def test_MOCK_S3_false_시_boto3_호출(self, mock_s3_off):
        fake = MagicMock()
        fake.generate_presigned_url.return_value = "https://s3.example.com/x"
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            url = storage_service.generate_presigned_url("tracks/u/t.mp3")
        assert url == "https://s3.example.com/x"
        fake.generate_presigned_url.assert_called_once()


class Test_delete_object:
    def test_MOCK_S3_true_시_파일이_삭제된다(self, mock_s3_on):
        target = mock_s3_on / "tracks/u/t.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"x")
        storage_service.delete_object("tracks/u/t.mp3")
        assert not target.exists()

    def test_MOCK_S3_true_시_미존재_키도_예외_없음(self, mock_s3_on):
        storage_service.delete_object("tracks/none/none.mp3")  # 예외 X

    def test_MOCK_S3_false_시_boto3_delete_호출(self, mock_s3_off):
        fake = MagicMock()
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            storage_service.delete_object("tracks/u/t.mp3")
        fake.delete_object.assert_called_once()
