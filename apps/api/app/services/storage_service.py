import uuid

import boto3
import structlog
from botocore.exceptions import ClientError

from app.core.config import STATIC_ROOT, settings

logger = structlog.get_logger()

TRACK_S3_PREFIX = "tracks"      # mp3 결과물 저장 위치
TRACK_PRESIGN_EXPIRY = 3600     # presigned URL 만료: 1시간 (trd.md §1 보안)

_MOCK_BASE_URL = "http://localhost:8000"


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

    # MOCK_S3=true → boto3 우회. 결과물을 /static 아래 동일 키 경로에 그대로 저장.
    # generate_presigned_url 도 같은 분기에서 /static URL 을 반환하므로 클라이언트가 즉시 재생 가능.
    if settings.MOCK_S3:
        target = STATIC_ROOT / s3_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(mp3_bytes)
        logger.info(
            "storage.mp3.uploaded.mock",
            user_id=str(user_id),
            track_id=str(track_id),
            s3_key=s3_key,
            size=len(mp3_bytes),
        )
        return s3_key

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
    # MOCK_S3=true → /static URL 반환. expires_in 개념 없음 (호출부는 URL 만 사용).
    if settings.MOCK_S3:
        return f"{_MOCK_BASE_URL}/static/{s3_key}"

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


def delete_object(s3_key: str) -> None:
    """S3에서 오브젝트 삭제. tracks_service.delete_track에서 위임."""
    # MOCK_S3=true → 로컬 파일 best-effort 삭제. 미존재여도 통과 (테스트 격리/멱등성).
    if settings.MOCK_S3:
        target = STATIC_ROOT / s3_key
        try:
            target.unlink(missing_ok=True)
            logger.info("storage.object.deleted.mock", s3_key=s3_key)
        except OSError as e:
            logger.warning("storage.object.delete.mock.failed", s3_key=s3_key, error=str(e))
        return

    s3 = _s3_client()
    try:
        s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        logger.info("storage.object.deleted", s3_key=s3_key)
    except ClientError as e:
        logger.error("storage.object.delete.failed", s3_key=s3_key, error=str(e))
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
