import uuid
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rewarded_ad_usage import RewardedAdUsage

logger = structlog.get_logger()

REWARDED_MONTHLY_LIMIT = 7  # PRD F11


def _current_year_month() -> int:
    """현재 UTC 기준 YYYYMM 정수 반환"""
    now = datetime.now(timezone.utc)
    return now.year * 100 + now.month


def _today_end_of_day_utc() -> datetime:
    """오늘 UTC 당일 끝 (23:59:59.999999) datetime 반환"""
    now = datetime.now(timezone.utc)
    return now.replace(hour=23, minute=59, second=59, microsecond=999999)


async def get_rewarded_status(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict:
    """
    현재 월 Rewarded Ad 상태 조회.
    레코드 없으면 count=0 상태로 반환 (DB 미삽입).
    """
    year_month = _current_year_month()
    result = await db.execute(
        select(RewardedAdUsage).where(
            RewardedAdUsage.user_id == user_id,
            RewardedAdUsage.year_month == year_month,
        )
    )
    usage = result.scalar_one_or_none()

    if not usage:
        return {
            "monthly_count": 0,
            "monthly_limit": REWARDED_MONTHLY_LIMIT,
            "remaining": REWARDED_MONTHLY_LIMIT,
            "is_exhausted": False,
            "today_unlock_expires_at": None,
            "is_unlocked_today": False,
        }

    now = datetime.now(timezone.utc)
    is_unlocked_today = (
        usage.today_unlock_expires_at is not None
        and usage.today_unlock_expires_at > now
    )

    return {
        "monthly_count": usage.monthly_count,
        "monthly_limit": REWARDED_MONTHLY_LIMIT,
        "remaining": max(0, REWARDED_MONTHLY_LIMIT - usage.monthly_count),
        "is_exhausted": usage.monthly_count >= REWARDED_MONTHLY_LIMIT,
        "today_unlock_expires_at": usage.today_unlock_expires_at,
        "is_unlocked_today": is_unlocked_today,
    }


async def claim_rewarded(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> dict:
    """
    Rewarded Ad 시청 완료 처리.

    흐름:
    1. 현재 월 usage 레코드 SELECT FOR UPDATE (동시 탭 방어)
    2. monthly_count >= 7 → 409 (이미 소진)
    3. monthly_count + 1, today_unlock_expires_at = 오늘 UTC 자정
    4. 레코드 없으면 INSERT (첫 시청)

    결정: FOR UPDATE + IntegrityError 방어
    - 클라이언트가 Rewarded 완료 후 빠르게 2번 탭하면 동시 요청 가능
    - 행이 이미 존재하는 경우: SELECT FOR UPDATE로 직렬화 → count 중복 방지
    - 행이 없는 경우(월 첫 시청): UniqueConstraint 위반 시 IntegrityError 포착 →
      rollback 후 재조회하여 UPDATE 경로로 처리
    """
    year_month = _current_year_month()

    result = await db.execute(
        select(RewardedAdUsage)
        .where(
            RewardedAdUsage.user_id == user_id,
            RewardedAdUsage.year_month == year_month,
        )
        .with_for_update()
    )
    usage = result.scalar_one_or_none()

    if usage is None:
        # 첫 시청: INSERT
        new_usage = RewardedAdUsage(
            user_id=user_id,
            year_month=year_month,
            monthly_count=1,
            today_unlock_expires_at=_today_end_of_day_utc(),
        )
        try:
            db.add(new_usage)
            await db.flush()  # commit 전 UniqueConstraint 위반 조기 감지
            usage = new_usage
        except IntegrityError:
            await db.rollback()
            # 동시 요청이 먼저 INSERT 성공 → 해당 행 재조회 후 UPDATE 경로로 처리
            result2 = await db.execute(
                select(RewardedAdUsage)
                .where(
                    RewardedAdUsage.user_id == user_id,
                    RewardedAdUsage.year_month == year_month,
                )
                .with_for_update()
            )
            usage = result2.scalar_one()
            if usage.monthly_count >= REWARDED_MONTHLY_LIMIT:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "REWARDED_MONTHLY_EXHAUSTED",
                        "message": "이번 달은 이미 모두 사용했어요.",
                        "monthly_count": usage.monthly_count,
                        "monthly_limit": REWARDED_MONTHLY_LIMIT,
                    },
                )
            usage.monthly_count += 1
            usage.today_unlock_expires_at = _today_end_of_day_utc()
    else:
        if usage.monthly_count >= REWARDED_MONTHLY_LIMIT:
            # 이미 7회 소진 — 클라이언트가 UI 방어를 뚫고 요청한 경우
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "REWARDED_MONTHLY_EXHAUSTED",
                    "message": "이번 달은 이미 모두 사용했어요.",
                    "monthly_count": usage.monthly_count,
                    "monthly_limit": REWARDED_MONTHLY_LIMIT,
                },
            )
        usage.monthly_count += 1
        usage.today_unlock_expires_at = _today_end_of_day_utc()

    await db.commit()

    logger.info(
        "rewarded.claim.success",
        user_id=str(user_id),
        year_month=year_month,
        monthly_count=usage.monthly_count,
    )

    return {
        "monthly_count": usage.monthly_count,
        "monthly_limit": REWARDED_MONTHLY_LIMIT,
        "remaining": max(0, REWARDED_MONTHLY_LIMIT - usage.monthly_count),
        "today_unlock_expires_at": usage.today_unlock_expires_at,
    }
