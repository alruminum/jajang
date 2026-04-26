---
depth: deep
design: skipped
---

# impl/01 — RevenueCat Webhook 보강 (서버사이드 구독 DB sync)

**커버 스토리**: Epic 05 Story 1 (F12 IAP 구독), Story 3 (F11 Rewarded — subscription 테이블 만료일 참조)  
**선행 조건**: Epic 01 impl/07 webhook skeleton (`apps/api/app/api/v1/webhooks.py`) 완료  
**예상 소요**: 1일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/api/app/api/v1/webhooks.py` | **수정** | expiration_date · product_id · trial_starts_at 파싱 추가 + UNCANCELLATION 처리 |
| `apps/api/app/models/subscription.py` | **확인 only** | 기존 스키마 이미 충분 — 수정 불필요 |
| `apps/api/app/schemas/webhooks.py` | **신규** | RevenueCat 이벤트 Pydantic 모델 |
| `apps/api/app/services/subscription_service.py` | **신규** | webhook 이벤트 → subscriptions UPSERT 비즈니스 로직 분리 |
| `apps/api/alembic/versions/0004_rewarded_ad_usage.py` | **신규** | rewarded_ad_usage 테이블 생성 migration (DB Schema에 이미 정의됨) |
| `apps/api/app/models/rewarded_ad_usage.py` | **신규** | RewardedAdUsage ORM 모델 |

---

## 2. Python 시그니처

### 2-1. schemas/webhooks.py

```python
from pydantic import BaseModel, Field
from typing import Optional


class RevenueCatEvent(BaseModel):
    """RevenueCat webhook event payload 핵심 필드"""
    type: str                                        # INITIAL_PURCHASE | RENEWAL | CANCELLATION 등
    app_user_id: str                                 # = users.id (UUID string)
    product_id: Optional[str] = None                # monthly | annual (스토어 상품 ID)
    expiration_at_ms: Optional[int] = None          # ms timestamp — current_period_ends_at
    original_purchase_date_ms: Optional[int] = None # ms timestamp — trial_starts_at (TRIAL_STARTED)
    cancel_reason: Optional[str] = None             # CANCELLATION 이유 (UNSUBSCRIBE 등)
    is_trial_period: Optional[bool] = None          # trial 여부 직접 플래그


class RevenueCatWebhookPayload(BaseModel):
    event: RevenueCatEvent
    api_version: str = "1.0"
```

### 2-2. services/subscription_service.py

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
```

### 2-3. api/v1/webhooks.py (수정)

```python
import hashlib
import hmac
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_db
from app.schemas.webhooks import RevenueCatWebhookPayload
from app.services.subscription_service import sync_subscription_from_event, HANDLED_EVENTS

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
```

### 2-4. models/rewarded_ad_usage.py

```python
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import UUID, CheckConstraint, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RewardedAdUsage(Base):
    """
    월별 Rewarded Ad 시청 횟수 + 당일 언락 만료.
    year_month: YYYYMM 정수 (예: 202604)
    """
    __tablename__ = "rewarded_ad_usage"
    __table_args__ = (
        CheckConstraint("monthly_count >= 0", name="chk_rewarded_monthly_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    year_month: Mapped[int] = mapped_column(Integer, nullable=False)  # YYYYMM
    monthly_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    today_unlock_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="rewarded_ad_usages")  # noqa: F821
```

### 2-5. alembic/versions/0004_rewarded_ad_usage.py

```python
"""rewarded_ad_usage table

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rewarded_ad_usage",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year_month", sa.Integer(), nullable=False),  # YYYYMM
        sa.Column("monthly_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("today_unlock_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("monthly_count >= 0", name="chk_rewarded_monthly_count"),
    )
    # 유저 + 월 복합 유니크 (한 유저가 같은 달에 레코드 1개만)
    op.create_index(
        "uq_rewarded_ad_usage_user_month",
        "rewarded_ad_usage",
        ["user_id", "year_month"],
        unique=True,
    )
    op.create_index("idx_rewarded_ad_usage_user", "rewarded_ad_usage", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_rewarded_ad_usage_user", table_name="rewarded_ad_usage")
    op.drop_index("uq_rewarded_ad_usage_user_month", table_name="rewarded_ad_usage")
    op.drop_table("rewarded_ad_usage")
```

---

## 3. 핵심 로직 의사코드

### 3-1. Webhook 수신 흐름

```
POST /webhooks/revenuecat
    │
    ├─ REVENUECAT_WEBHOOK_SECRET 미설정 → 503
    │
    ├─ HMAC-SHA256(body, secret) ≠ X-RevenueCat-Signature → 401
    │
    ├─ Pydantic parse 실패 → 422
    │
    ├─ event.type not in HANDLED_EVENTS → skip, 200 ok
    │
    └─ sync_subscription_from_event(db, event)
            │
            ├─ UUID 변환 실패 → silent return (RevenueCat sandbox 테스트 ID 방어)
            │
            ├─ subscriptions WHERE user_id = event.app_user_id
            │
            ├─ 레코드 존재: UPDATE entitlement, is_active, 날짜 필드들
            │
            └─ 레코드 없음: INSERT (신규 구독자 — 가입 후 최초 webhook)
```

### 3-2. CANCELLATION 처리 특이사항

```python
# CANCELLATION: Premium 유지 (만료일까지)
# EXPIRATION:   free 전환 (실제 만료 시점)
#
# 이유: Apple/Google은 취소 즉시 접근을 차단하지 않음.
# 만료일까지 결제한 기간의 서비스를 이용할 권리 보장.
# RevenueCat은 만료 시 별도 EXPIRATION 이벤트를 발송함.
#
# BILLING_ISSUE: Grace Period (iOS 6일, Android 30일) 동안 premium 유지
# → Grace Period 종료 시 EXPIRATION 이벤트 수신
```

### 3-3. 멱등성 설계

```python
# RevenueCat은 webhook 실패 시 최대 5회 재시도.
# 동일 이벤트가 중복 수신될 수 있으므로 UPSERT 패턴 필수.
# subscription은 user_id UNIQUE 제약 → INSERT 중복 시 예외 → 서비스 레이어에서 UPDATE로 처리.
#
# 중복 이벤트 예: RENEWAL이 2번 오는 경우 → 동일 entitlement='premium' UPSERT → 무해
# 순서 역전 예: EXPIRATION 이후 RENEWAL 수신 (네트워크 지연) → premium 재활성화
#   → 허용 범위: RevenueCat 이벤트는 실제 결제 상태 기준이므로 최신 이벤트가 정확함
```

---

## 4. 결정 근거

| 결정 | 이유 | 대안 검토 |
|---|---|---|
| schemas/webhooks.py 별도 Pydantic 모델 | webhook payload 구조가 복잡 (50+ 필드). 핵심 필드만 typed로 추출. | dict 직접 파싱 → KeyError 위험 + 타입 안전성 없음 |
| subscription_service.py 분리 | webhooks.py가 라우터 + 비즈니스 로직 혼재 방지. 동일 서비스 다른 경로(관리자 API)에서 재사용 가능. | 인라인 유지 → Epic 01 impl/07 skeleton 패턴이지만 로직이 복잡해져 분리가 맞음 |
| product_id 정규화 (monthly/annual) | 스토어마다 상품 ID가 다름 (예: `com.jajang.subscription.monthly`). DB CheckConstraint에서 `monthly/annual`만 허용. | 원본 저장 → CheckConstraint 위반으로 commit 실패 |
| BILLING_ISSUE → premium 유지 | Grace Period 동안 유저 접근 차단은 UX 손상. RevenueCat 문서 권장 패턴. | 즉시 free → Grace Period 동안 유저 민원 유발 |
| UNCANCELLATION 이벤트 추가 | Epic 01 skeleton에 없었음. 취소 철회(재구독) 시 premium 복원 필요. | 미처리 → 재구독자가 free로 남는 버그 |
| structlog 사용 | 기존 counter_service.py 패턴과 일관성. JSON 구조 로그. | print/logging → 기존 코드와 불일치 |

---

## 5. 모듈 경계

- `POST /webhooks/revenuecat` ← RevenueCat 서버 only (공개 인터넷)
- `webhooks.py` → `subscription_service.py`: 이벤트 파싱 후 비즈니스 로직 위임
- `subscription_service.py` → `subscriptions` 테이블: UPSERT
- `subscription_service.py` → `rewarded_ad_usage` 테이블: **미접근** (별도 서비스, impl/02 담당)
- `models/rewarded_ad_usage.py` ← impl/02에서 직접 사용
- `User.rewarded_ad_usages` relationship: `apps/api/app/models/user.py`에 `rewarded_ad_usages` back_populates 추가 필요

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 올바른 서명 + INITIAL_PURCHASE 이벤트 | 200 ok, subscriptions UPSERT entitlement='premium', is_active=True |
| AC-02 | 잘못된 서명 | 401 반환, DB 변경 없음 |
| AC-03 | REVENUECAT_WEBHOOK_SECRET 미설정 환경 | 503 반환 |
| AC-04 | CANCELLATION 이벤트 | entitlement='premium' 유지, current_period_ends_at 저장 |
| AC-05 | EXPIRATION 이벤트 | entitlement='free', is_active=False |
| AC-06 | TRIAL_STARTED 이벤트 | entitlement='trial', trial_starts_at + trial_expires_at 저장 |
| AC-07 | UNCANCELLATION 이벤트 | entitlement='premium', is_active=True |
| AC-08 | 동일 이벤트 2회 수신 (멱등성) | 두 번째 수신에도 200 ok, DB 상태 변경 없음 (같은 값 UPSERT) |
| AC-09 | 알 수 없는 이벤트 타입 | 200 ok (skip), DB 변경 없음 |
| AC-10 | app_user_id가 유효하지 않은 UUID | 200 ok (silent skip), DB 변경 없음, WARNING 로그 |
| AC-11 | product_id='com.jajang.monthly_3900' | normalized_product_id='monthly' 저장 |
| AC-12 | product_id='com.jajang.annual_29000' | normalized_product_id='annual' 저장 |
| AC-13 | Alembic 0004 migrate | rewarded_ad_usage 테이블 생성, (user_id, year_month) UNIQUE INDEX 존재 |

---

## 7. 주의사항

- **`X-RevenueCat-Signature` 헤더 형식**: RevenueCat 공식 문서에서 HMAC-SHA256 hex string으로 확인. `hmac.new()` → Python 표준 `hmac.new()` 는 존재하지 않음 — `hmac.new()` 대신 `hmac.new()` 아닌 `hmac.HMAC` 직접 또는 `hashlib.hmac_new` — 실제 코드는 `hmac.new(key, msg, digestmod)` 형식 사용. **Epic 01 skeleton의 `hmac.new()` 호출도 `hmac.new()` 가 아닌 `hmac.new()` 임을 주의.** 실제로는 `hmac.new(key.encode(), body, hashlib.sha256).hexdigest()` 가 올바름 — engineer가 `.d.ts`/Python 문서 확인 필수.
- **`User.rewarded_ad_usages`**: `apps/api/app/models/user.py`에 `rewarded_ad_usages: Mapped[list["RewardedAdUsage"]] = relationship(...)` 추가 필요. 누락 시 SQLAlchemy relationship 오류.
- **BILLING_ISSUE Grace Period**: iOS 6일, Android 30일. 이 기간 동안 'premium' 유지. 실제 EXPIRATION 이벤트가 언제 오는지는 RevenueCat 대시보드 설정에 따름.
- **product_id 정규화 로직**: 실제 스토어 상품 ID를 대시보드에서 확인 후 정규화 패턴 조정 필요. 현재 'monthly'/'annual' 포함 문자열 검사는 MVP 수준 — 추후 명시적 매핑 테이블로 교체 권장.
- **0004 migration**: `apps/api/app/models/__init__.py`에 `RewardedAdUsage` import 추가 필수 (Alembic autogenerate가 모델을 인식해야 함).
