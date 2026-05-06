"""
녹음 클립 24h TTL 자동 삭제 Celery task.

1시간 주기로 실행. recordings.schedule_delete_at <= NOW() AND s3_key IS NOT NULL
인 row 의 S3 객체를 삭제 후 s3_key=NULL.

실패한 row 는 schedule_delete_at 유지 → 다음 주기 자동 재시도 (이중 안전망: S3 lifecycle rule 백업).
"""

import structlog
from datetime import datetime, timezone
from celery import shared_task
from sqlalchemy import select, update

from app.core.db import SyncSessionLocal
from app.models.recording import Recording
from app.services.storage_service import delete_object

logger = structlog.get_logger()

BATCH_LIMIT = 500  # 1주기당 최대 처리 row (large delete storm 방지)


@shared_task(name="tasks.clip_cleanup", bind=True, max_retries=2, default_retry_delay=300)
def clip_cleanup_task(self):
    """
    1시간 주기. recordings.schedule_delete_at <= NOW() AND s3_key IS NOT NULL 인 row 의
    S3 객체를 삭제 후 s3_key=NULL.

    반환: {"deleted": int, "skipped": int, "errors": int}
    실패한 row 는 schedule_delete_at 유지 → 다음 주기 재시도 (자동 백업).
    """
    now = datetime.now(timezone.utc)
    deleted = skipped = errors = 0

    with SyncSessionLocal() as db:
        rows = (
            db.execute(
                select(Recording)
                .where(
                    Recording.schedule_delete_at <= now,
                    Recording.s3_key.isnot(None),
                )
                .limit(BATCH_LIMIT)
            )
            .scalars()
            .all()
        )

        for rec in rows:
            s3_key = rec.s3_key
            try:
                delete_object(s3_key)
                db.execute(
                    update(Recording)
                    .where(Recording.id == rec.id)
                    .values(s3_key=None)
                )
                deleted += 1
                logger.info("clip.deleted", recording_id=str(rec.id), s3_key=s3_key)
            except Exception as e:
                errors += 1
                logger.warning("clip.delete_failed", recording_id=str(rec.id), error=str(e))
                # schedule_delete_at 유지 → 다음 주기 재시도

        db.commit()

    logger.info("clip_cleanup.summary", deleted=deleted, skipped=skipped, errors=errors)
    return {"deleted": deleted, "skipped": skipped, "errors": errors}
