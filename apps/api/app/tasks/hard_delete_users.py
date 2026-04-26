"""
soft delete 후 30일 경과한 계정을 DB에서 완전 삭제하는 Celery 태스크.
실행 주기: 매일 18:00 UTC (03:00 KST) — Celery Beat crontab.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.core.celery_app import celery_app
from app.core.db import get_db_session
from app.models.audit_log import AuditLog
from app.models.user import User

logger = logging.getLogger(__name__)

HARD_DELETE_AFTER_DAYS = 30


@celery_app.task(name="tasks.hard_delete_expired_users", bind=True)
def hard_delete_expired_users(self):
    """
    soft delete 후 30일 초과한 계정을 DB에서 완전 삭제.
    users ON DELETE CASCADE 로 연관 테이블 레코드도 함께 삭제됨.
    audit_logs 는 FK 없으므로 유지됨 (법적 보존 목적).
    """

    async def _run():
        cutoff = datetime.now(timezone.utc) - timedelta(days=HARD_DELETE_AFTER_DAYS)
        async with get_db_session() as db:
            result = await db.execute(
                select(User).where(
                    User.deleted_at.is_not(None),
                    User.deleted_at <= cutoff,
                )
            )
            users = result.scalars().all()

            deleted_count = 0
            for user in users:
                user_id_str = str(user.id)
                await db.execute(delete(User).where(User.id == user.id))
                db.add(AuditLog(
                    user_id=user_id_str,
                    action="account_hard_deleted",
                    metadata={"days_since_soft_delete": HARD_DELETE_AFTER_DAYS},
                ))
                logger.info("hard_delete_user", extra={"user_id": user_id_str})
                deleted_count += 1

            await db.commit()
            logger.info(
                "hard_delete_completed",
                extra={"deleted_count": deleted_count},
            )

    asyncio.run(_run())
