import hashlib
import hmac

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.schemas.webhooks import RevenueCatWebhookPayload
from app.services.subscription_service import HANDLED_EVENTS, sync_subscription_from_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = structlog.get_logger()


@router.post("/revenuecat")
async def revenuecat_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    # 시크릿 미설정 시 503 — 빈 키로 HMAC 가능하여 보안 구멍
    if not settings.REVENUECAT_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    body = await request.body()

    # 서명 검증 (X-RevenueCat-Signature: HMAC-SHA256 hex)
    signature = request.headers.get("X-RevenueCat-Signature", "")
    expected = hmac.new(
        settings.REVENUECAT_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        logger.warning("webhook.signature.invalid", signature=signature[:20])
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Pydantic 파싱 (유효하지 않은 페이로드는 422)
    try:
        payload = RevenueCatWebhookPayload.model_validate_json(body)
    except Exception as exc:
        logger.warning("webhook.parse.failed", error=str(exc))
        raise HTTPException(status_code=422, detail="Invalid payload")

    event = payload.event
    event_type = event.type

    logger.info(
        "webhook.revenuecat.received",
        event_type=event_type,
        app_user_id=event.app_user_id,
        product_id=event.product_id,
    )

    if event_type in HANDLED_EVENTS and event.app_user_id:
        try:
            await sync_subscription_from_event(db, event)
        except Exception as exc:
            # DB 오류 시 500 반환 → RevenueCat이 재시도 (멱등성 보장)
            logger.error("webhook.sync.failed", error=str(exc), event_type=event_type)
            raise HTTPException(status_code=500, detail="Sync failed")
    else:
        logger.info("webhook.revenuecat.skipped", event_type=event_type)

    return {"status": "ok"}
