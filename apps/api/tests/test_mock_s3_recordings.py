"""
#127 — MOCK_S3=true 환경 녹음 업로드/검증 흐름 테스트

대상:
- apps/api/app/api/v1/mock_s3.py — PUT /_mock_s3/{key} 수신 라우트
- apps/api/app/main.py — MOCK_S3 조건부 라우터 등록
- apps/api/app/services/recording_service.init_upload — MOCK_S3=true 시 mock URL 발급
- apps/api/app/services/quality_check_service.validate_sample — MOCK_S3=true 시 SNR skip

수용 기준:
- MOCK_S3=true → boto3 우회, 서버 내부 mock 라우트 URL 발급
- MOCK_S3=true → SNR 분석 skip, status='validated', snr_db>=15.0
- MOCK_S3=false → 기존 boto3 presigned URL 흐름 유지
- 프로덕션(MOCK_S3=false) 시 mock_s3 라우터 미등록
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.mock_s3 import router as mock_s3_router
from app.models.voice_sample import VoiceSample
from app.schemas.recordings import UploadInitRequest
from app.services import quality_check_service, recording_service


# ── 픽스처: MOCK_S3 토글 ─────────────────────────────────────────────────────
@pytest.fixture
def mock_s3_on(monkeypatch):
    """recording_service / quality_check_service 양쪽이 import한 settings 모듈 모두 패치."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", True)
    # service 모듈이 `from app.core.config import settings` 한 인스턴스도 동일 객체이므로
    # 위 한 줄로 두 모듈 모두 영향 받지만, 안전하게 재확인
    monkeypatch.setattr(recording_service.settings, "MOCK_S3", True, raising=False)
    monkeypatch.setattr(quality_check_service.settings, "MOCK_S3", True, raising=False)


@pytest.fixture
def mock_s3_off(monkeypatch):
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", False)
    monkeypatch.setattr(recording_service.settings, "MOCK_S3", False, raising=False)
    monkeypatch.setattr(quality_check_service.settings, "MOCK_S3", False, raising=False)


def _mock_db() -> AsyncMock:
    db = AsyncMock(spec=AsyncSession)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    return db


def _make_sample(user_id: uuid.UUID) -> VoiceSample:
    return VoiceSample(
        id=uuid.uuid4(),
        user_id=user_id,
        s3_key=f"samples/{user_id}/test.wav",
        status="uploaded",
        created_at=datetime.now(timezone.utc),
    )


# ── REQ-MOCK-PUT: mock_s3 라우트가 PUT 수신 + 200 반환 ───────────────────────
class TestMockS3PutRoute:
    """PUT /_mock_s3/{key:path} → 200 + {key, bytes_received} 반환."""

    @pytest.fixture
    def client(self) -> TestClient:
        app = FastAPI()
        app.include_router(mock_s3_router, prefix="/api/v1")
        return TestClient(app)

    def test_put_요청이_200을_반환해야_한다(self, client):
        """REQ-MOCK-PUT: 단순 PUT → 200 status."""
        body = b"fake-audio-bytes"
        resp = client.put("/api/v1/_mock_s3/samples/u1/abc.wav", content=body)

        assert resp.status_code == 200

    def test_응답에_key_경로가_포함되어야_한다(self, client):
        """REQ-MOCK-PUT: 응답 JSON.key == 요청 경로의 {key:path}."""
        resp = client.put("/api/v1/_mock_s3/samples/u1/abc.wav", content=b"x")

        assert resp.json()["key"] == "samples/u1/abc.wav"

    def test_응답에_bytes_received가_요청_본문_길이와_일치해야_한다(self, client):
        """REQ-MOCK-PUT: bytes_received == len(body)."""
        body = b"a" * 1234
        resp = client.put("/api/v1/_mock_s3/samples/u/x.wav", content=body)

        assert resp.json()["bytes_received"] == 1234

    def test_빈_본문도_200을_반환해야_한다(self, client):
        """REQ-MOCK-PUT: 빈 PUT 도 거부 없이 200 (개발환경 단순 수신용)."""
        resp = client.put("/api/v1/_mock_s3/empty.wav", content=b"")

        assert resp.status_code == 200
        assert resp.json()["bytes_received"] == 0

    def test_여러_세그먼트_경로_key가_그대로_보존되어야_한다(self, client):
        """REQ-MOCK-PUT: {key:path} 라 슬래시 포함 경로 그대로 캡처."""
        resp = client.put("/api/v1/_mock_s3/a/b/c/d.wav", content=b"x")

        assert resp.json()["key"] == "a/b/c/d.wav"


# ── REQ-MAIN-INCLUDE: MOCK_S3 조건부 라우터 등록 ────────────────────────────
class TestMainConditionalMockRouter:
    """main.create_app() 호출 시 MOCK_S3 값에 따라 mock_s3 라우터 등록 여부 결정."""

    def _has_mock_route(self, app: FastAPI) -> bool:
        return any("/_mock_s3/" in r.path for r in app.routes)

    def test_MOCK_S3_true_시_mock_s3_라우터가_등록되어야_한다(self, mock_s3_on):
        """REQ-MAIN-INCLUDE: settings.MOCK_S3=True → /_mock_s3 라우트 존재."""
        from app.main import create_app

        app = create_app()
        assert self._has_mock_route(app)

    def test_MOCK_S3_false_시_mock_s3_라우터가_등록되지_않아야_한다(self, mock_s3_off):
        """REQ-MAIN-INCLUDE: 프로덕션 노출 차단 — MOCK_S3=False → /_mock_s3 라우트 없음."""
        from app.main import create_app

        app = create_app()
        assert not self._has_mock_route(app)


# ── REQ-INIT-MOCK: recording_service.init_upload — MOCK_S3=true ─────────────
class TestInitUploadMockBranch:
    """MOCK_S3=true → boto3 호출 없이 서버 내부 mock URL 발급."""

    @pytest.mark.asyncio
    async def test_upload_url이_localhost_mock_라우트를_가리켜야_한다(self, mock_s3_on):
        """REQ-INIT-MOCK: upload_url == http://localhost:8000/api/v1/_mock_s3/{s3_key}."""
        db = _mock_db()
        user_id = uuid.uuid4()
        req = UploadInitRequest(
            song_key="brahms",
            file_size_bytes=1024,
            content_type="audio/wav",
        )

        with patch("app.services.recording_service.boto3.client") as boto_mock:
            resp = await recording_service.init_upload(db, user_id, req)

        assert resp.upload_url.startswith("http://localhost:8000/api/v1/_mock_s3/")
        assert resp.s3_key in resp.upload_url
        # MOCK_S3=true 시 boto3는 호출되면 안 됨 (회귀 방지: SignatureDoesNotMatch 우회 목적)
        boto_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_DB에_voice_sample_레코드가_생성되어야_한다(self, mock_s3_on):
        """REQ-INIT-MOCK: 업로드 완료 콜백 조회용 DB 레코드 선행 생성 유지."""
        db = _mock_db()
        user_id = uuid.uuid4()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/wav")

        await recording_service.init_upload(db, user_id, req)

        added = [c.args[0] for c in db.add.call_args_list]
        samples = [o for o in added if isinstance(o, VoiceSample)]
        assert len(samples) == 1
        assert samples[0].user_id == user_id
        assert samples[0].status == "uploaded"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_s3_key_경로에_user_id와_sample_id가_포함되어야_한다(self, mock_s3_on):
        """REQ-INIT-MOCK: s3_key = samples/{user_id}/{sample_id}.wav."""
        db = _mock_db()
        user_id = uuid.uuid4()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/wav")

        resp = await recording_service.init_upload(db, user_id, req)

        assert resp.s3_key.startswith(f"samples/{user_id}/")
        assert resp.s3_key.endswith(".wav")
        assert resp.sample_id in resp.s3_key

    @pytest.mark.asyncio
    async def test_m4a_content_type은_m4a_확장자로_저장된다(self, mock_s3_on):
        """REQ-INIT-MOCK: content_type='audio/m4a' → s3_key.endswith('.m4a')."""
        db = _mock_db()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/m4a")

        resp = await recording_service.init_upload(db, uuid.uuid4(), req)

        assert resp.s3_key.endswith(".m4a")

    @pytest.mark.asyncio
    async def test_expires_in_seconds가_15분이어야_한다(self, mock_s3_on):
        """REQ-INIT-MOCK: 응답 expires_in_seconds == SAMPLE_UPLOAD_EXPIRY (900)."""
        db = _mock_db()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/wav")

        resp = await recording_service.init_upload(db, uuid.uuid4(), req)

        assert resp.expires_in_seconds == recording_service.SAMPLE_UPLOAD_EXPIRY


# ── REQ-INIT-S3: recording_service.init_upload — MOCK_S3=false (회귀) ───────
class TestInitUploadS3Branch:
    """MOCK_S3=false → 기존 boto3 presigned URL 흐름 유지."""

    @pytest.mark.asyncio
    async def test_boto3_generate_presigned_url이_호출되어야_한다(self, mock_s3_off):
        """REQ-INIT-S3: MOCK_S3=false → boto3.client().generate_presigned_url 호출."""
        db = _mock_db()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/wav")

        s3 = MagicMock()
        s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"
        with patch("app.services.recording_service.boto3.client", return_value=s3):
            resp = await recording_service.init_upload(db, uuid.uuid4(), req)

        s3.generate_presigned_url.assert_called_once()
        assert resp.upload_url == "https://s3.example.com/presigned"

    @pytest.mark.asyncio
    async def test_upload_url이_mock_라우트를_가리키지_않아야_한다(self, mock_s3_off):
        """REQ-INIT-S3: MOCK_S3=false 시 mock URL을 발급하면 안 됨 (회귀 방지)."""
        db = _mock_db()
        req = UploadInitRequest(song_key="brahms", file_size_bytes=1, content_type="audio/wav")

        s3 = MagicMock()
        s3.generate_presigned_url.return_value = "https://s3.example.com/presigned"
        with patch("app.services.recording_service.boto3.client", return_value=s3):
            resp = await recording_service.init_upload(db, uuid.uuid4(), req)

        assert "_mock_s3" not in resp.upload_url


# ── REQ-VALIDATE-MOCK: quality_check_service.validate_sample MOCK 분기 ─────
class TestValidateSampleMockBranch:
    """MOCK_S3=true → SNR 분석 skip, 통과 (sample_not_found 외)."""

    def _stub_sample_lookup(self, db: AsyncMock, sample: VoiceSample | None) -> None:
        result = MagicMock()
        result.scalar_one_or_none.return_value = sample
        db.execute = AsyncMock(return_value=result)

    @pytest.mark.asyncio
    async def test_MOCK_S3_true_시_passed가_True여야_한다(self, mock_s3_on):
        """REQ-VALIDATE-MOCK: SNR 검증 우회 → passed=True."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        self._stub_sample_lookup(db, sample)

        result = await quality_check_service.validate_sample(db, sample.id, str(user_id))

        assert result.passed is True
        assert result.fail_reason is None

    @pytest.mark.asyncio
    async def test_MOCK_S3_true_시_snr_db가_임계값_이상이어야_한다(self, mock_s3_on):
        """REQ-VALIDATE-MOCK: mock snr_db 값이 SNR_THRESHOLD_DB(15.0) 이상."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        self._stub_sample_lookup(db, sample)

        result = await quality_check_service.validate_sample(db, sample.id, str(user_id))

        assert result.snr_db is not None
        assert result.snr_db >= quality_check_service.SNR_THRESHOLD_DB

    @pytest.mark.asyncio
    async def test_MOCK_S3_true_시_status가_validated로_업데이트된다(self, mock_s3_on):
        """REQ-VALIDATE-MOCK: 통과 시 sample.status='validated' + commit."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        self._stub_sample_lookup(db, sample)

        await quality_check_service.validate_sample(db, sample.id, str(user_id))

        assert sample.status == "validated"
        assert sample.snr_db is not None
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_MOCK_S3_true_시_S3_다운로드가_호출되지_않아야_한다(self, mock_s3_on):
        """REQ-VALIDATE-MOCK: SNR skip 분기는 _download_from_s3 / boto3 호출 없음."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        self._stub_sample_lookup(db, sample)

        with patch(
            "app.services.quality_check_service._download_from_s3",
            new_callable=AsyncMock,
        ) as dl_mock, patch(
            "app.services.quality_check_service._compute_snr"
        ) as snr_mock:
            await quality_check_service.validate_sample(db, sample.id, str(user_id))

        dl_mock.assert_not_called()
        snr_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_MOCK_S3_true_여도_샘플_미존재시_sample_not_found(self, mock_s3_on):
        """REQ-VALIDATE-MOCK: 권한/존재 가드는 mock 분기 *이전* 에 평가되어야 한다."""
        db = _mock_db()
        self._stub_sample_lookup(db, None)

        result = await quality_check_service.validate_sample(
            db, uuid.uuid4(), str(uuid.uuid4())
        )

        assert result.passed is False
        assert result.fail_reason == "sample_not_found"


# ── REQ-VALIDATE-S3: MOCK_S3=false (회귀) ─────────────────────────────────
class TestValidateSampleS3Branch:
    """MOCK_S3=false → 기존 SNR 분석 흐름 유지."""

    @pytest.mark.asyncio
    async def test_MOCK_S3_false_시_S3_다운로드가_호출되어야_한다(self, mock_s3_off):
        """REQ-VALIDATE-S3: 회귀 방지 — MOCK_S3=false 시 SNR 분석 path 진입."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        result = MagicMock()
        result.scalar_one_or_none.return_value = sample
        db.execute = AsyncMock(return_value=result)

        with patch(
            "app.services.quality_check_service._download_from_s3",
            new_callable=AsyncMock,
            return_value=b"fake-bytes",
        ) as dl_mock, patch(
            "app.services.quality_check_service._compute_snr",
            return_value=20.0,
        ) as snr_mock:
            r = await quality_check_service.validate_sample(db, sample.id, str(user_id))

        dl_mock.assert_awaited_once()
        snr_mock.assert_called_once()
        assert r.passed is True
        assert r.snr_db == 20.0

    @pytest.mark.asyncio
    async def test_MOCK_S3_false_시_낮은_SNR은_실패해야_한다(self, mock_s3_off):
        """REQ-VALIDATE-S3: SNR < 15.0 → passed=False, fail_reason='snr_too_low'."""
        db = _mock_db()
        user_id = uuid.uuid4()
        sample = _make_sample(user_id)
        result = MagicMock()
        result.scalar_one_or_none.return_value = sample
        db.execute = AsyncMock(return_value=result)

        with patch(
            "app.services.quality_check_service._download_from_s3",
            new_callable=AsyncMock,
            return_value=b"x",
        ), patch(
            "app.services.quality_check_service._compute_snr",
            return_value=5.0,
        ):
            r = await quality_check_service.validate_sample(db, sample.id, str(user_id))

        assert r.passed is False
        assert r.fail_reason == "snr_too_low"
