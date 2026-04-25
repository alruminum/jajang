import uuid
from datetime import datetime, timezone

import boto3
import structlog
from botocore.exceptions import ClientError
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.voice_sample import VoiceSample
from app.schemas.recordings import (
    UploadCompleteResponse,
    UploadInitRequest,
    UploadInitResponse,
)

logger = structlog.get_logger()

SAMPLE_UPLOAD_EXPIRY = 900  # presigned PUT URL 유효 시간: 15분
SAMPLE_S3_PREFIX = "samples"  # private prefix (ACL 공개 없음)


def _s3_client():
    s3_kwargs: dict = {
        "region_name": settings.S3_REGION,
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
    }
    # Cloudflare R2 지원: S3_ENDPOINT_URL 설정 시 자동 사용
    if settings.S3_ENDPOINT_URL:
        s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    return boto3.client("s3", **s3_kwargs)


async def init_upload(
    db: AsyncSession,
    user_id: uuid.UUID,
    req: UploadInitRequest,
) -> UploadInitResponse:
    """
    1. VoiceSample DB 레코드 생성 (status='uploaded' 초기값)
    2. S3 presigned PUT URL 발급 (15분 유효)
    3. 응답 반환
    """
    sample_id = uuid.uuid4()
    # 경로: samples/{user_id}/{sample_id}.wav (또는 .m4a)
    # user_id 포함으로 개인 데이터 격리 + 삭제 스케줄러 조회 용이
    extension = "wav" if "wav" in req.content_type else "m4a"
    s3_key = f"{SAMPLE_S3_PREFIX}/{user_id}/{sample_id}.{extension}"

    # DB 레코드 선행 생성 (업로드 완료 콜백에서 조회 가능하도록)
    sample = VoiceSample(
        id=sample_id,
        user_id=user_id,
        s3_key=s3_key,
        status="uploaded",
        created_at=datetime.now(timezone.utc),
    )
    db.add(sample)
    await db.commit()

    # presigned PUT URL 발급
    try:
        s3 = _s3_client()
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": req.content_type,
            },
            ExpiresIn=SAMPLE_UPLOAD_EXPIRY,
        )
    except ClientError as e:
        # DB 레코드가 생성됐으나 URL 발급 실패 → 레코드 정리
        await db.delete(sample)
        await db.commit()
        logger.error("s3.presign.put.failed", user_id=str(user_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="업로드 준비에 실패했어요. 잠시 후 다시 시도해주세요",
        )

    logger.info(
        "recording.upload.init",
        user_id=str(user_id),
        sample_id=str(sample_id),
        song_key=req.song_key,
    )

    return UploadInitResponse(
        sample_id=str(sample_id),
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in_seconds=SAMPLE_UPLOAD_EXPIRY,
    )


async def complete_upload(
    db: AsyncSession,
    user_id: uuid.UUID,
    sample_id: str,
    duration_seconds: float,
    rms_db: float,
    peak_count: int,
) -> UploadCompleteResponse:
    """
    클라이언트 업로드 완료 통보 처리.
    - 클라이언트 1차 검증 메타 저장 (duration, rms_db, peak_count)
    - status는 'uploaded' 유지 (서버 2차 SNR 검증은 impl/03 quality_check_service에서 담당)
    """
    result = await db.execute(
        select(VoiceSample).where(
            VoiceSample.id == uuid.UUID(sample_id),
            VoiceSample.user_id == user_id,
            VoiceSample.deleted_at.is_(None),
        )
    )
    sample = result.scalar_one_or_none()
    if not sample:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="녹음 파일을 찾을 수 없어요",
        )

    sample.duration_seconds = duration_seconds
    sample.rms_db = rms_db
    sample.peak_count = peak_count
    await db.commit()

    logger.info(
        "recording.upload.complete",
        user_id=str(user_id),
        sample_id=sample_id,
        duration_seconds=duration_seconds,
        rms_db=rms_db,
        peak_count=peak_count,
    )

    return UploadCompleteResponse(sample_id=sample_id)
