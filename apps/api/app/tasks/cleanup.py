"""
목소리 샘플 24h 자동 삭제 스케줄러.
실행 주기: 매 시각 정각 (Celery Beat crontab).
설계 상세 → docs/voice-pipeline.md §6.
"""

import asyncio
from datetime import datetime, timezone

import boto3
import structlog
from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.db import get_db_session
from app.models.voice_sample import VoiceSample
from app.core.config import settings

logger = structlog.get_logger()

CLEANUP_BATCH_SIZE = 100  # 1회 실행당 최대 처리 건수


def _delete_s3_object(s3_key: str) -> None:
    """동기 S3 삭제 — Celery task 내부에서 직접 호출."""
    client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.S3_ENDPOINT_URL} if settings.S3_ENDPOINT_URL else {}),
    )
    client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)


@celery_app.task(name="tasks.cleanup_voice_samples", bind=True)
def cleanup_voice_samples(self):
    """
    schedule_delete_at <= NOW() 인 샘플 S3 삭제 + DB deleted_at 세팅.
    S3 삭제 실패 시 해당 레코드 스킵 — 다음 주기에 재시도.
    S3 lifecycle policy (2일 만료)가 백업으로 동작.
    """

    async def _run():
        async with get_db_session() as db:
            result = await db.execute(
                select(VoiceSample)
                .where(
                    VoiceSample.deleted_at.is_(None),
                    VoiceSample.schedule_delete_at <= datetime.now(timezone.utc),
                )
                .limit(CLEANUP_BATCH_SIZE)
            )
            samples = result.scalars().all()

            deleted_count = 0
            failed_count = 0

            for sample in samples:
                try:
                    _delete_s3_object(sample.s3_key)
                    sample.deleted_at = datetime.now(timezone.utc)
                    sample.status = "deleted"
                    deleted_count += 1

                    logger.info(
                        "voice_sample_deleted",
                        user_id=str(sample.user_id),
                        sample_id=str(sample.id),
                        created_at=sample.created_at.isoformat(),
                        schedule_delete_at=sample.schedule_delete_at.isoformat(),
                        actual_deleted_at=datetime.now(timezone.utc).isoformat(),
                    )
                except Exception as e:
                    failed_count += 1
                    logger.error(
                        "voice_sample_delete_failed",
                        sample_id=str(sample.id),
                        s3_key=sample.s3_key,
                        error=str(e),
                    )
                    # schedule_delete_at 유지 → 다음 주기에 재시도

            await db.commit()
            logger.info(
                "cleanup.completed",
                deleted=deleted_count,
                failed=failed_count,
                total=len(samples),
            )

    asyncio.run(_run())
