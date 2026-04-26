---
depth: deep
design: skipped
---

# impl/01 — 서버: 계정 탈퇴 & 전체 데이터 삭제 엔드포인트

**Epic**: 06 — 개인정보 & 데이터 관리  
**Story**: Story 3 — 계정 탈퇴 & 전체 데이터 삭제  
**예상 소요**: 4~6h (엔드포인트 + 감사 로그 + 테스트)

---

## 1. 생성 / 수정 파일

| 경로 | 작업 |
|---|---|
| `/Users/dc.kim/project/jajang/apps/api/api/v1/users.py` | `DELETE /users/me` 라우터 추가 |
| `/Users/dc.kim/project/jajang/apps/api/services/account_deletion_service.py` | 신규 — 계단형 삭제 오케스트레이터 |
| `/Users/dc.kim/project/jajang/apps/api/models/audit_log.py` | 신규 — AuditLog ORM 모델 |
| `/Users/dc.kim/project/jajang/apps/api/schemas/users.py` | `AccountDeletionResponse` Pydantic 스키마 추가 |
| `/Users/dc.kim/project/jajang/apps/api/alembic/versions/0005_add_audit_logs.py` | 신규 — audit_logs 테이블 migration |
| `/Users/dc.kim/project/jajang/apps/api/tests/test_account_deletion.py` | 신규 — 삭제 흐름 통합 테스트 |

---

## 2. DB 스키마 추가 (migration 0005)

```sql
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,           -- 탈퇴 후에도 기록 보존 (FK 없음, 탈퇴 이벤트 추적)
    action      TEXT NOT NULL,  -- 'account_deletion_requested' | 'account_hard_deleted'
    metadata    JSONB,          -- {"provider": "apple", "entitlement": "free", ...}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);
```

**설계 결정**: audit_logs.user_id 에 FK 를 걸지 않는다.
- 이유: 탈퇴 완료 후 users 행이 hard delete 되면 FK constraint 위반 발생. 감사 로그는 법적 증거 목적으로 탈퇴 이후에도 보존 필요. user_id 는 식별자 역할만 하는 텍스트로 취급.
- 대안: users.deleted_at soft delete 유지 기간(30일) 동안만 FK 유지 → 기각. 30일 후 hard delete 스케줄 실행 시 audit_logs 도 정리해야 하는 복잡도 증가.

---

## 3. API 계약

### DELETE /users/me

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**성공 응답 (202 Accepted)**:
```json
{
  "status": "deletion_scheduled",
  "message": "계정과 모든 데이터를 삭제했어요."
}
```

**실패: 구독 활성 상태 (422)**:
```json
{
  "detail": {
    "code": "ACTIVE_SUBSCRIPTION",
    "message": "구독을 먼저 취소해주세요. 앱스토어/플레이스토어에서 진행할 수 있어요.",
    "subscription_platform": "ios"  // "ios" | "android"
  }
}
```

**실패: 인증 없음 (401)**:
```json
{ "detail": "Not authenticated" }
```

---

## 4. Python 시그니처

### `api/v1/users.py` 라우터

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.core.db import get_async_session
from app.services.account_deletion_service import AccountDeletionService
from app.schemas.users import AccountDeletionResponse
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])

@router.delete(
    "/me",
    response_model=AccountDeletionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="계정 탈퇴 및 전체 데이터 삭제",
)
async def delete_my_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AccountDeletionResponse:
    """
    계정과 연결된 모든 데이터를 삭제한다.

    삭제 순서 (계단형):
      1. S3 목소리 샘플 파일 삭제
      2. S3 생성 음원 파일 삭제
      3. generated_tracks 레코드 삭제 (CASCADE로 DB 처리)
      4. voice_samples 레코드 삭제 (CASCADE)
      5. rewarded_ad_usage 삭제 (CASCADE)
      6. generation_counters 삭제 (CASCADE)
      7. subscriptions 삭제 — 단, is_active=True 이면 422 반환 (삭제 전 체크)
      8. users.deleted_at = NOW() (soft delete)
      9. audit_log 기록

    hard delete (users 행 완전 제거)는 30일 후 Celery Beat 스케줄로 처리.
    """
    service = AccountDeletionService(db)
    return await service.delete_account(current_user)
```

### `services/account_deletion_service.py`

```python
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.user import User
from app.models.voice_sample import VoiceSample
from app.models.generated_track import GeneratedTrack
from app.models.subscription import Subscription
from app.models.audit_log import AuditLog
from app.services.storage_service import StorageService
from app.schemas.users import AccountDeletionResponse

logger = logging.getLogger(__name__)


class AccountDeletionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.storage = StorageService()

    async def delete_account(self, user: User) -> AccountDeletionResponse:
        """계단형 삭제 오케스트레이터. 트랜잭션 내에서 실행."""
        async with self.db.begin():
            await self._guard_active_subscription(user.id)
            await self._delete_s3_voice_samples(user.id)
            await self._delete_s3_generated_tracks(user.id)
            # DB CASCADE 삭제는 users soft delete 후 처리되나
            # 명시적으로 먼저 처리해 orphan 방지
            await self._soft_delete_user(user)
            await self._write_audit_log(user, action="account_deletion_requested")

        return AccountDeletionResponse(
            status="deletion_scheduled",
            message="계정과 모든 데이터를 삭제했어요.",
        )

    # ------------------------------------------------------------------ #
    # private helpers
    # ------------------------------------------------------------------ #

    async def _guard_active_subscription(self, user_id: str) -> None:
        """구독 활성 상태면 422 — 클라이언트가 먼저 취소하도록 유도."""
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.is_active == True,  # noqa: E712
            )
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            return

        platform = "ios" if sub.product_id and "ios" in (sub.product_id or "") else "android"
        # RevenueCat webhook 에서 product_id 는 스토어 SKU — 플랫폼 판단은
        # revenuecat_customer_id prefix 또는 별도 platform 컬럼으로 개선 가능.
        # V1은 단순 휴리스틱 허용 (iOS 우선 앱 특성상 대부분 ios).
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "ACTIVE_SUBSCRIPTION",
                "message": "구독을 먼저 취소해주세요. 앱스토어/플레이스토어에서 진행할 수 있어요.",
                "subscription_platform": platform,
            },
        )

    async def _delete_s3_voice_samples(self, user_id: str) -> None:
        """S3 목소리 샘플 파일 삭제 후 DB status = 'deleted' 마킹."""
        result = await self.db.execute(
            select(VoiceSample).where(
                VoiceSample.user_id == user_id,
                VoiceSample.deleted_at.is_(None),
            )
        )
        samples = result.scalars().all()
        for sample in samples:
            try:
                await self.storage.delete_object(sample.s3_key)
            except Exception:
                # S3 삭제 실패는 치명적이지 않음 — 로그 후 계속
                logger.error(
                    "s3_delete_failed",
                    extra={"s3_key": sample.s3_key, "user_id": user_id},
                )
            sample.deleted_at = datetime.now(timezone.utc)
            sample.status = "deleted"

    async def _delete_s3_generated_tracks(self, user_id: str) -> None:
        """S3 생성 음원 파일 삭제. DB 레코드는 CASCADE 삭제로 처리."""
        result = await self.db.execute(
            select(GeneratedTrack).where(
                GeneratedTrack.user_id == user_id,
                GeneratedTrack.s3_key.is_not(None),
                GeneratedTrack.status == "completed",
            )
        )
        tracks = result.scalars().all()
        for track in tracks:
            try:
                await self.storage.delete_object(track.s3_key)
            except Exception:
                logger.error(
                    "s3_delete_failed",
                    extra={"s3_key": track.s3_key, "user_id": user_id},
                )

    async def _soft_delete_user(self, user: User) -> None:
        """users.deleted_at 세팅 — CASCADE로 연관 테이블 DB 레코드 정리."""
        user.deleted_at = datetime.now(timezone.utc)
        self.db.add(user)

    async def _write_audit_log(self, user: User, action: str) -> None:
        log = AuditLog(
            user_id=str(user.id),
            action=action,
            metadata={
                "provider": user.provider,
                "email": user.email,
                "entitlement": None,  # subscription join 없이 빠르게 기록 (후처리 가능)
            },
        )
        self.db.add(log)
```

### `models/audit_log.py`

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Text, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Text, nullable=True, index=True)   # FK 없음 (설계 결정 §2 참조)
    action = Column(Text, nullable=False)
    metadata = Column(JSON, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
```

### `schemas/users.py` 추가 스키마

```python
from pydantic import BaseModel

class AccountDeletionResponse(BaseModel):
    status: str   # "deletion_scheduled"
    message: str
```

---

## 5. Celery Beat — 30일 후 hard delete 태스크

```python
# apps/api/tasks/hard_delete_users.py

from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from app.core.db import SyncSessionLocal
from app.models.user import User
from app.models.audit_log import AuditLog
import logging

logger = logging.getLogger(__name__)

def hard_delete_expired_users() -> None:
    """
    soft delete 후 30일 초과한 계정을 DB에서 완전 삭제.
    users ON DELETE CASCADE 로 연관 테이블 레코드도 함께 삭제됨.
    audit_logs 는 FK 없으므로 유지됨 (법적 보존 목적).
    실행 주기: 매일 03:00 KST (Celery Beat crontab)
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    with SyncSessionLocal() as db:
        result = db.execute(
            select(User).where(
                User.deleted_at.is_not(None),
                User.deleted_at <= cutoff,
            )
        )
        users = result.scalars().all()
        for user in users:
            db.execute(delete(User).where(User.id == user.id))
            db.add(AuditLog(
                user_id=str(user.id),
                action="account_hard_deleted",
                metadata={"days_since_soft_delete": 30},
            ))
            logger.info("hard_delete_user", extra={"user_id": str(user.id)})
        db.commit()
```

**Celery Beat 등록 (apps/api/core/celery_app.py)**:
```python
app.conf.beat_schedule["hard_delete_expired_users"] = {
    "task": "app.tasks.hard_delete_users.hard_delete_expired_users",
    "schedule": crontab(hour=18, minute=0),  # 18:00 UTC = 03:00 KST
}
```

---

## 6. 핵심 로직 — 삭제 순서와 실패 처리

```
DELETE /users/me 수신
    │
    ▼
get_current_user() — JWT 검증, deleted_at IS NULL 확인
    │
    ▼
_guard_active_subscription()
    ├─ is_active=True → 422 ACTIVE_SUBSCRIPTION (트랜잭션 시작 전 반환)
    └─ 구독 없거나 inactive → 계속
    │
    ▼
BEGIN TRANSACTION
    │
    ├─ _delete_s3_voice_samples()
    │     → S3 삭제 실패 시 로그만, 트랜잭션 계속 (S3 ≠ DB 원자성 불가)
    │
    ├─ _delete_s3_generated_tracks()
    │     → 동일 정책
    │
    ├─ _soft_delete_user()
    │     → users.deleted_at = NOW()
    │     → CASCADE: voice_samples, generated_tracks, generation_counters,
    │                rewarded_ad_usage, subscriptions DB 레코드 삭제
    │
    ├─ _write_audit_log(action="account_deletion_requested")
    │
    └─ COMMIT
    │
    ▼
202 { status: "deletion_scheduled" }

[30일 후]
Celery Beat → hard_delete_expired_users()
    → users 행 완전 제거 + audit_log(account_hard_deleted)
```

**S3 ↔ DB 원자성 주의**: S3는 트랜잭션 외부 리소스이므로 DB COMMIT 후 S3 삭제 실패 시 orphan 파일이 남을 수 있다. V1 대응:
- S3 삭제 실패는 로그로만 남기고 계정 삭제는 계속 진행
- S3 lifecycle rule 로 `/samples/` 와 `/tracks/{user_id}/` prefix 에 90일 만료 설정을 백업으로 유지
- 수동 정리 스크립트는 V2 개선 항목으로 backlog 추가

---

## 7. 테스트 시나리오 (`tests/test_account_deletion.py`)

| # | 시나리오 | Given | When | Then |
|---|---|---|---|---|
| 1 | 정상 탈퇴 (무료) | 유저 존재, 구독 없음 | DELETE /users/me | 202, users.deleted_at set, S3 mock 호출 확인, audit_log 생성 |
| 2 | 정상 탈퇴 (트라이얼 만료) | entitlement=trial, is_active=False | DELETE /users/me | 202 (만료 구독은 통과) |
| 3 | 구독 활성 시 탈퇴 차단 | is_active=True | DELETE /users/me | 422 ACTIVE_SUBSCRIPTION |
| 4 | 인증 없이 호출 | 토큰 없음 | DELETE /users/me | 401 |
| 5 | 이미 soft-deleted 유저 | deleted_at IS NOT NULL | DELETE /users/me | 401 (get_current_user 에서 차단) |
| 6 | S3 삭제 실패 | S3 mock throw | DELETE /users/me | 202, S3 실패 로그 존재, DB soft delete 완료 |
| 7 | hard delete Celery | soft delete 31일 경과 유저 | 태스크 수동 실행 | users 행 없음, audit_log(hard_deleted) 존재 |

---

## 8. 결정 근거

| 결정 | 채택 | 기각된 대안 |
|---|---|---|
| soft delete → 30일 후 hard delete | GDPR Art.17 권리 준수 + 실수 복구 창 확보 | 즉시 hard delete: 복구 불가, 세금 분쟁 시 증거 부재 |
| CASCADE FK 삭제 | DB 무결성 자동 보장, 쿼리 단순화 | 수동 delete 쿼리 N개: 순서 오류 시 orphan 발생 위험 |
| audit_logs FK 없음 | 탈퇴 후에도 감사 기록 보존 | FK with ON DELETE SET NULL: NULL user_id 로 오염 |
| 구독 활성 시 422 (삭제 불허) | 앱스토어 결제 분쟁 방지 (구독 취소 없이 탈퇴 → 계속 과금) | 구독 자동 취소: RevenueCat API 서버측 취소는 제한적, 환불 분쟁 가능 |
| S3 삭제 실패 = 로그만 | 사용자 경험 > 완벽한 원자성. orphan S3 파일은 lifecycle rule로 백업 정리 | 트랜잭션 롤백: S3 삭제 부분 성공 시 정합성 더 나빠짐 |

---

## 9. 다른 모듈 경계

- **auth 모듈**: `get_current_user` 는 `users.deleted_at IS NULL` 조건을 포함해야 한다. soft delete 후 동일 JWT로 재접근 차단 필수. 이미 구현되지 않았다면 impl/01 배포 전 auth 모듈 패치 필요.
- **Celery tasks**: `hard_delete_expired_users` 는 `tasks/sample_cleanup.py` 에 있는 beat schedule 등록 파일과 동일한 `celery_app.py` 에 등록. 충돌 없음.
- **RevenueCat webhook**: 구독 취소 webhook 수신 시 `subscriptions.is_active = False` 로 업데이트하는 기존 로직(Epic 05)이 선행 완료되어야 `_guard_active_subscription` 이 정확하게 동작한다.
- **StorageService**: 기존 `services/storage_service.py` 의 `delete_object(s3_key: str)` 메서드가 있다고 가정. 없으면 추가 필요.

---

## 10. 수용 기준

- [ ] `DELETE /users/me` — 구독 없는 유저: 202 반환, users.deleted_at 세팅
- [ ] `DELETE /users/me` — 구독 활성 유저: 422 + `ACTIVE_SUBSCRIPTION` code
- [ ] S3 voice_samples 파일: 삭제 또는 deleted_at 마킹 확인
- [ ] S3 generated_tracks 파일: 삭제 시도 확인
- [ ] audit_logs 테이블: `account_deletion_requested` 레코드 생성 확인
- [ ] Celery Beat: `hard_delete_expired_users` 태스크 등록 확인
- [ ] soft-deleted 유저 JWT로 재인증 시 401 반환 확인
- [ ] migration 0005: `alembic upgrade head` 오류 없음
