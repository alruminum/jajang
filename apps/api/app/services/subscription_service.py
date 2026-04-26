import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Subscription
from app.schemas.webhooks import RevenueCatEvent

# 이벤트 타입 → entitlement 매핑
ENTITLEMENT_MAP: dict[str, str] = {
    "TRIAL_STARTED": "trial",
    "TRIAL_CONVERTED": "premium",
    "INITIAL_PURCHASE": "premium",
    "RENEWAL": "premium",
    "CANCELLATION": "premium",    # 만료일까지 Premium 유지
    "UNCANCELLATION": "premium",  # 재구독 (취소 철회)
    "EXPIRATION": "free",
    "BILLING_ISSUE": "premium",   # 결제 문제 — Grace Period 동안 유지
    "PRODUCT_CHANGE": "premium",  # 플랜 변경
}

# 처리 대상 이벤트 세트
HANDLED_EVENTS: set[str] = set(ENTITLEMENT_MAP.keys())


async def sync_subscription_from_event(
    db: AsyncSession,
    event: RevenueCatEvent,
) -> None:
    """
    RevenueCat 이벤트 → subscriptions 테이블 UPSERT.

    결정:
    - product_id 정규화: 스토어마다 상품 ID 형식이 다름.
      'jajang_monthly', 'monthly_3900' 등 모두 'monthly'로 정규화.
      'annual', 'yearly' 포함 문자열은 'annual'로.
    - CANCELLATION: entitlement='premium' 유지 (만료일까지 접근 허용).
      만료 시 EXPIRATION 이벤트로 'free' 전환.
    - expiration_at_ms: ms → datetime 변환 후 current_period_ends_at 저장.
    - trial_starts_at: TRIAL_STARTED 이벤트의 original_purchase_date_ms 사용.
    """
    try:
        user_id = uuid.UUID(event.app_user_id)
    except ValueError:
        return  # 유효하지 않은 UUID — silent skip (로그는 호출자에서)

    entitlement = ENTITLEMENT_MAP.get(event.type, "free")

    # product_id 정규화
    normalized_product_id: Optional[str] = None
    if event.product_id:
        pid = event.product_id.lower()
        if "annual" in pid or "yearly" in pid or "year" in pid:
            normalized_product_id = "annual"
        elif "monthly" in pid or "month" in pid:
            normalized_product_id = "monthly"

    # timestamp 변환
    current_period_ends_at: Optional[datetime] = None
    if event.expiration_at_ms:
        current_period_ends_at = datetime.fromtimestamp(
            event.expiration_at_ms / 1000, tz=timezone.utc
        )

    trial_starts_at: Optional[datetime] = None
    if event.type == "TRIAL_STARTED" and event.original_purchase_date_ms:
        trial_starts_at = datetime.fromtimestamp(
            event.original_purchase_date_ms / 1000, tz=timezone.utc
        )

    trial_expires_at: Optional[datetime] = None
    if event.type == "TRIAL_STARTED" and event.expiration_at_ms:
        trial_expires_at = current_period_ends_at  # trial 만료 = 구독 기간 종료일

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if sub:
        sub.entitlement = entitlement
        sub.is_active = entitlement != "free"
        sub.updated_at = now
        if normalized_product_id:
            sub.product_id = normalized_product_id
        if current_period_ends_at:
            sub.current_period_ends_at = current_period_ends_at
        if trial_starts_at:
            sub.trial_starts_at = trial_starts_at
        if trial_expires_at:
            sub.trial_expires_at = trial_expires_at
    else:
        sub = Subscription(
            user_id=user_id,
            revenuecat_customer_id=event.app_user_id,
            entitlement=entitlement,
            is_active=entitlement != "free",
            product_id=normalized_product_id,
            current_period_ends_at=current_period_ends_at,
            trial_starts_at=trial_starts_at,
            trial_expires_at=trial_expires_at,
        )
        db.add(sub)

    await db.commit()


async def get_subscription(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> Optional[Subscription]:
    """유저 구독 상태 조회 (GET /me/subscription 또는 앱 entitlement 확인용)"""
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    return result.scalar_one_or_none()
