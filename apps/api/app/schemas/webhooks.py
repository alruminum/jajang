from typing import Optional

from pydantic import BaseModel


class RevenueCatEvent(BaseModel):
    """RevenueCat webhook event payload 핵심 필드"""

    type: str  # INITIAL_PURCHASE | RENEWAL | CANCELLATION 등
    app_user_id: str  # = users.id (UUID string)
    product_id: Optional[str] = None  # monthly | annual (스토어 상품 ID)
    expiration_at_ms: Optional[int] = None  # ms timestamp — current_period_ends_at
    original_purchase_date_ms: Optional[int] = None  # ms timestamp — trial_starts_at (TRIAL_STARTED)
    cancel_reason: Optional[str] = None  # CANCELLATION 이유 (UNSUBSCRIBE 등)
    is_trial_period: Optional[bool] = None  # trial 여부 직접 플래그


class RevenueCatWebhookPayload(BaseModel):
    event: RevenueCatEvent
    api_version: str = "1.0"
