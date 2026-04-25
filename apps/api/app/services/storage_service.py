import uuid

import boto3
import structlog
from botocore.exceptions import ClientError

from app.core.config import settings

logger = structlog.get_logger()

TRACK_S3_PREFIX = "tracks"      # mp3 결과물 저장 위치
TRACK_PRESIGN_EXPIRY = 3600     # presigned URL 만료: 1시간 (trd.md §1 보안)


def upload_mp3(
    user_id: uuid.UUID,
    track_id: uuid.UUID,
    mp3_bytes: bytes,
) -> str:
    """
    생성된 mp3 바이너리를 S3에 업로드.
    반환값: s3_key (e.g. "tracks/{user_id}/{track_id}.mp3")
    """
    s3_key = f"{TRACK_S3_PREFIX}/{user_id}/{track_id}.mp3"

    s3 = _s3_client()
    try:
        s3.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=mp3_bytes,
            ContentType="audio/mpeg",
        )
        logger.info("storage.mp3.uploaded", user_id=str(user_id), track_id=str(track_id), s3_key=s3_key)
    except ClientError as e:
        logger.error("storage.mp3.upload.failed", user_id=str(user_id), error=str(e))
        raise

    return s3_key


def generate_presigned_url(s3_key: str) -> str:
    """
    mp3 S3 경로에 대한 presigned GET URL 반환 (1시간 만료).
    클라이언트가 직접 S3에서 다운로드할 때 사용.
    """
    s3 = _s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
            },
            ExpiresIn=TRACK_PRESIGN_EXPIRY,
        )
        return url
    except ClientError as e:
        logger.error("storage.presign.failed", s3_key=s3_key, error=str(e))
        raise


def _s3_client():
    """boto3 S3 클라이언트. R2 endpoint 분기 포함."""
    s3_kwargs: dict = {
        "region_name": settings.S3_REGION,
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
    }
    if settings.S3_ENDPOINT_URL:
        s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    return boto3.client("s3", **s3_kwargs)
