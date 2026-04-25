import hashlib
import hmac
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.models.subscription import Subscription

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

HANDLED_EVENTS = {
    "TRIAL_STARTED",
    "TRIAL_CONVERTED",
    "INITIAL_PURCHASE",
    "RENEWAL",
    "CANCELLATION",
    "EXPIRATION",
}

ENTITLEMENT_MAP: dict[str, str] = {
    "TRIAL_STARTED": "trial",
    "TRIAL_CONVERTED": "premium",
    "INITIAL_PURCHASE": "premium",
    "RENEWAL": "premium",
    "CANCELLATION": "premium",  # 만료일까지 유지
    "EXPIRATION": "free",
}


@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # 시크릿 미설정 시 503 — 빈 키로 HMAC 계산하면 서명 위조 가능
    if not settings.REVENUECAT_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    # 서명 검증 (RevenueCat 대시보드 shared secret)
    body = await request.body()
    signature = request.headers.get("X-RevenueCat-Signature", "")
    expected = hmac.new(
        settings.REVENUECAT_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event = payload.get("event", {})
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")  # = user.id (UUID string)

    if event_type in HANDLED_EVENTS and app_user_id:
        await _sync_subscription(db, app_user_id, event_type, event)

    return {"status": "ok"}


async def _sync_subscription(
    db: AsyncSession,
    user_id_str: str,
    event_type: str,
    event: dict,
) -> None:
    """subscriptions 테이블 UPSERT"""
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        return

    entitlement = ENTITLEMENT_MAP.get(event_type, "free")

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.entitlement = entitlement
        sub.is_active = entitlement != "free"
        sub.updated_at = datetime.now(timezone.utc)
    else:
        sub = Subscription(
            user_id=user_id,
            revenuecat_customer_id=event.get("app_user_id", user_id_str),
            entitlement=entitlement,
            is_active=entitlement != "free",
        )
        db.add(sub)
    await db.commit()
