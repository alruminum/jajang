"""
서버 2차 품질 검증 — SNR 분석.
클라이언트 1차 검증(길이/RMS/클리핑)은 앱에서 이미 통과한 상태로 진입.
서버는 SNR(잡음비) 검증만 추가로 수행.

라이브러리: librosa (오디오 분석), numpy, boto3 (S3 다운로드)
의존성: librosa>=0.10.0, soundfile>=0.12.1 (pyproject.toml)
"""

import io
import asyncio
import uuid
from typing import Literal

import librosa
import numpy as np
import boto3
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.voice_sample import VoiceSample
from app.core.config import settings

logger = structlog.get_logger()

# 품질 기준 상수 (docs/voice-pipeline.md §4 기준)
SNR_THRESHOLD_DB = 15.0  # SNR 최소 기준

ValidationFailReason = Literal["snr_too_low", "sample_not_found", "s3_error", "analysis_error"]


def _compute_snr(audio_bytes: bytes) -> float:
    """
    librosa로 오디오 로드 후 RMS 기반 SNR 추정.
    음성 구간(상위 75%): 신호 / 배경 구간(하위 25%): 잡음으로 추정.
    알고리즘 상세 → docs/voice-pipeline.md §4.
    """
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)

    frame_length = int(0.025 * sr)  # 25ms 프레임
    hop_length = int(0.010 * sr)    # 10ms 홉

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    signal_rms = float(np.percentile(rms, 75))
    noise_rms = float(np.percentile(rms, 25))

    snr_db = 20.0 * np.log10((signal_rms + 1e-10) / (noise_rms + 1e-10))
    return snr_db


async def _download_from_s3(s3_key: str) -> bytes:
    """S3/R2에서 샘플 다운로드 (asyncio executor로 boto3 동기 호출 래핑)."""

    def _sync_download() -> bytes:
        client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            **({"endpoint_url": settings.S3_ENDPOINT_URL} if settings.S3_ENDPOINT_URL else {}),
        )
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return response["Body"].read()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_download)


class QualityCheckResult:
    def __init__(
        self,
        passed: bool,
        snr_db: float | None,
        fail_reason: ValidationFailReason | None = None,
    ) -> None:
        self.passed = passed
        self.snr_db = snr_db
        self.fail_reason = fail_reason


async def validate_sample(
    db: AsyncSession,
    sample_id: str,
    user_id: str,
) -> QualityCheckResult:
    """
    S3에서 샘플 다운로드 → SNR 분석 → DB 결과 기록.
    통과 시 status='validated', snr_db 기록.
    실패 시 status='uploaded' 유지 (재녹음 유도, 삭제는 클라이언트 요청 또는 24h 스케줄러).
    """
    result = await db.execute(
        select(VoiceSample).where(
            VoiceSample.id == uuid.UUID(sample_id),
            VoiceSample.user_id == uuid.UUID(user_id),
            VoiceSample.deleted_at.is_(None),
        )
    )
    sample = result.scalar_one_or_none()
    if not sample:
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="sample_not_found")

    # S3 다운로드
    try:
        audio_bytes = await _download_from_s3(sample.s3_key)
    except Exception as e:
        logger.error("quality_check.s3_download.failed", sample_id=sample_id, error=str(e))
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="s3_error")

    # SNR 분석
    try:
        snr_db = _compute_snr(audio_bytes)
    except Exception as e:
        logger.error("quality_check.analysis.failed", sample_id=sample_id, error=str(e))
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="analysis_error")

    passed = snr_db >= SNR_THRESHOLD_DB

    # DB 업데이트
    sample.snr_db = snr_db
    if passed:
        sample.status = "validated"
    # 실패 시 status='uploaded' 유지 — 재녹음 유도
    await db.commit()

    logger.info(
        "quality_check.completed",
        sample_id=sample_id,
        snr_db=round(snr_db, 2),
        passed=passed,
    )

    return QualityCheckResult(passed=passed, snr_db=snr_db)
