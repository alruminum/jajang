"""Trial 인지 entitlement 평가 헬퍼 — pure functions, no I/O."""

from datetime import datetime

from app.core.constants import PREMIUM_ENTITLEMENTS


def is_active_trial(trial_expires_at: datetime | None, now: datetime) -> bool:
    """trial_expires_at 이 미래인가."""
    return trial_expires_at is not None and trial_expires_at > now


def evaluate_entitlement(
    is_active_subscription: bool,
    trial_expires_at: datetime | None,
    now: datetime,
) -> str:
    """
    반환: 'premium' | 'trial' | 'free'
    우선순위: subscription > trial > free.
    카운터 적용 대상은 'free' 만.
    """
    if is_active_subscription:
        return "premium"
    if is_active_trial(trial_expires_at, now):
        return "trial"
    return "free"


def is_premium_or_trial(entitlement: str) -> bool:
    """카운터 skip 여부 (entitlement IN ('premium', 'trial'))."""
    return entitlement in PREMIUM_ENTITLEMENTS
