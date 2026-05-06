"""generation_counters 테이블 race-safe 헬퍼."""

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import FREE_GENERATION_LIMIT
from app.models.generation_counter import GenerationCounter


async def get_count_for_update(db: AsyncSession, user_id: uuid.UUID) -> int:
    """SELECT count FROM generation_counters WHERE user_id=? FOR UPDATE. 부재 시 0 반환."""
    row = (
        await db.execute(
            select(GenerationCounter)
            .where(GenerationCounter.user_id == user_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    return row.count if row else 0


async def assert_below_limit_or_raise(
    db: AsyncSession, user_id: uuid.UUID, entitlement: str
) -> None:
    """entitlement='free' + count >= FREE_GENERATION_LIMIT 시 HTTPException 402 GENERATION_LIMIT_EXCEEDED."""
    if entitlement != "free":
        return
    count = await get_count_for_update(db, user_id)
    if count >= FREE_GENERATION_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "GENERATION_LIMIT_EXCEEDED", "count": count},
        )


def increment_if_free_sync(
    db, user_id: uuid.UUID, entitlement: str, now: datetime
) -> None:
    """Celery task 전용 (sync). entitlement='free' 만 count += 1 + last_generated_at + updated_at."""
    if entitlement != "free":
        return
    db.execute(
        update(GenerationCounter)
        .where(GenerationCounter.user_id == user_id)
        .values(
            count=GenerationCounter.count + 1,
            last_generated_at=now,
            updated_at=now,
        )
        .execution_options(synchronize_session=False)
    )
