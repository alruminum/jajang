---
depth: std
design: skipped
---

# impl/02 — 서버사이드 Rewarded Ad 월 카운터

**커버 스토리**: Epic 05 Story 3 (F11 Rewarded Ad 월 7회 한도 서버 enforcement)  
**선행 조건**: impl/01 완료 (rewarded_ad_usage 테이블 migration 0004)  
**예상 소요**: 0.5일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/api/app/services/rewarded_service.py` | **신규** | 월 카운터 조회 + claim 비즈니스 로직 |
| `apps/api/app/api/v1/rewarded.py` | **신규** | POST /rewarded/claim, GET /rewarded/status |
| `apps/api/app/api/v1/__init__.py` | **수정** | rewarded 라우터 등록 |
| `apps/api/app/schemas/rewarded.py` | **신규** | ClaimRequest / ClaimResponse / StatusResponse |

---

## 2. Python 시그니처

### 2-1. schemas/rewarded.py

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RewardedClaimRequest(BaseModel):
    """Rewarded Ad 시청 완료 후 클라이언트가 전송"""
    # 미래 확장: ad_impression_id (AdMob server-side verification용)
    # MVP에서는 클라이언트 신호 신뢰 (서버사이드 SSV 미구현)
    pass


class RewardedClaimResponse(BaseModel):
    monthly_count: int                              # 현재 월 누적 시청 횟수
    monthly_limit: int                              # 7
    remaining: int                                  # monthly_limit - monthly_count
    today_unlock_expires_at: Optional[datetime]     # 오늘 자정 UTC


class RewardedStatusResponse(BaseModel):
    monthly_count: int
    monthly_limit: int
    remaining: int
    is_exhausted: bool
    today_unlock_expires_at: Optional[datetime]
    is_unlocked_today: bool                         # 현재 자정 이전까지 언락 여부
```

### 2-2. services/rewarded_service.py

```python
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from app.models.rewarded_ad_usage import RewardedAdUsage

logger = structlog.get_logger()

REWARDED_MONTHLY_LIMIT = 7  # PRD F11


def _current_year_month() -> int:
    """현재 UTC 기준 YYYYMM 정수 반환"""
    now = datetime.now(timezone.utc)
    return now.year * 100 + now.month


def _today_midnight_utc() -> datetime:
    """오늘 UTC 자정 (23:59:59.999999) datetime 반환"""
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    return midnight


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

    결정: FOR UPDATE 사용 이유
    - 클라이언트가 Rewarded 완료 후 빠르게 2번 탭하면 동시 요청 가능
    - FOR UPDATE로 하나만 통과, 나머지는 대기 → count 2 중복 방지
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

    now = datetime.now(timezone.utc)

    if usage is None:
        # 첫 시청: INSERT
        usage = RewardedAdUsage(
            user_id=user_id,
            year_month=year_month,
            monthly_count=1,
            today_unlock_expires_at=_today_midnight_utc(),
        )
        db.add(usage)
    else:
        if usage.monthly_count >= REWARDED_MONTHLY_LIMIT:
            # 이미 7회 소진 — 클라이언트가 UI 방어를 뚫고 요청한 경우
            from fastapi import HTTPException, status
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
        usage.today_unlock_expires_at = _today_midnight_utc()
        usage.updated_at = now

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
```

### 2-3. api/v1/rewarded.py

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.rewarded import RewardedClaimRequest, RewardedClaimResponse, RewardedStatusResponse
from app.services.rewarded_service import get_rewarded_status, claim_rewarded

router = APIRouter(prefix="/rewarded", tags=["rewarded"])


@router.get("/status", response_model=RewardedStatusResponse)
async def rewarded_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RewardedStatusResponse:
    """현재 월 Rewarded Ad 사용 상태 조회"""
    status_data = await get_rewarded_status(db, current_user.id)
    return RewardedStatusResponse(**status_data)


@router.post("/claim", response_model=RewardedClaimResponse)
async def rewarded_claim(
    _req: RewardedClaimRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RewardedClaimResponse:
    """
    Rewarded Ad 시청 완료 후 서버 카운터 업데이트 + 당일 언락 등록.
    409: 이미 월 7회 소진
    """
    claim_data = await claim_rewarded(db, current_user.id)
    return RewardedClaimResponse(**claim_data)
```

---

## 3. 핵심 로직 의사코드

### 3-1. 클라이언트 → 서버 호출 시점

```
[클라이언트 rewardedAdService.loadAndShowRewardedAd()]
    │
    ├─ EARNED_REWARD 이벤트 수신 (AdMob 시청 완료 확인)
    │
    └─ POST /rewarded/claim 호출
            │
            ├─ 200: monthly_count + today_unlock_expires_at
            │         → useSubscriptionStore 업데이트 (서버 응답 기준)
            │         → usePlayerStore.rewardedUnlockExpiresAt = today_unlock_expires_at
            │
            └─ 409: 이미 소진 (UI 방어 실패 케이스)
                      → "이번 달은 이미 모두 사용했어요" 처리
```

### 3-2. 월 전환 처리

```
GET /rewarded/status 호출 시 year_month = current YYYYMM
이전 달 레코드는 조회 안 됨 → monthly_count = 0 반환
→ 별도 주기적 정리 불필요 (이전 달 레코드는 자연스럽게 조회 제외)
→ 이전 달 레코드 삭제: 선택적 Celery 주기 작업 (DB 용량 이슈 없으면 MVP 불필요)
```

### 3-3. 당일 언락 유효성

```python
# is_unlocked_today 판단
today_unlock_expires_at > datetime.now(timezone.utc)
# → 자정(23:59:59.999) 이전이면 True
# → 자정 이후 앱 실행 시 False → 무료 정책 적용 (AudioEngine 참조)
```

---

## 4. 결정 근거

| 결정 | 이유 | 대안 검토 |
|---|---|---|
| 클라이언트 EARNED_REWARD 후 POST /claim | MVP 단계. AdMob Server-Side Verification(SSV)은 백엔드 추가 엔드포인트 + Google 인증 필요. 앱 재설치 시 리셋은 허용 범위 (PRD 명시). | SSV → 구현 복잡도 과다, M1 이후 검토 |
| SELECT FOR UPDATE | 동시 claim 중복 방지. generation_counter와 동일 패턴으로 일관성 유지. | 낙관적 잠금 → 충돌 시 재시도 로직 필요, 수면앱 특성상 동시 탭 빈도 낮아 비용 대비 효과 작음 |
| year_month = YYYYMM 정수 | 파티셔닝 대용 + 쿼리 단순화. DATE 타입 대비 인덱스 크기 동일하나 비교 연산 직관적. | (user_id, month_start_date) DATE 컬럼 → 동일 기능, 컨벤션 차이만 있음 |
| 서버 today_unlock_expires_at UTC 자정 | 클라이언트 로컬 자정과 차이 발생 가능 (타임존). 그러나 MVP에서 서버 UTC 기준이 단순함. 한국 서비스이므로 KST 자정으로 변경 가능 (UTC+9: `midnight - timedelta(hours=9)`). | KST 자정 → 추후 타임존 설정 파라미터화 권장 |
| GET /rewarded/status 별도 엔드포인트 | 앱 시작 시 카운터 동기화 목적. claim과 분리하여 캐싱 가능성 확보. | claim 응답에만 포함 → 앱 재시작 시 동기화 불가 |

---

## 5. 모듈 경계

- `POST /rewarded/claim` ← 앱 클라이언트 (JWT 인증 필수)
- `GET /rewarded/status` ← 앱 클라이언트 (JWT 인증 필수)
- `rewarded_service.py` → `rewarded_ad_usage` 테이블
- `rewarded_service.py` → `subscription_service.py`: **미접근** (entitlement 확인은 deps.get_current_user 경유)
- **entitlement 체크 없음**: 무료 유저만 claim 가능하지만 서버에서 entitlement 체크를 별도로 하지 않음 — 클라이언트가 trial/premium 유저에게 버튼 미노출. 만약 premium 유저가 claim 호출하면 카운터만 증가 (해롭지 않음). 강한 제약 필요 시 `get_current_entitlement()` deps 추가 가능.
- `apps/api/app/api/v1/__init__.py` → `rewarded.router` 등록

---

## 6. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 첫 번째 claim (월 초) | 200, monthly_count=1, today_unlock_expires_at=오늘 UTC 23:59:59 |
| AC-02 | 7번째 claim | 200, monthly_count=7, remaining=0 |
| AC-03 | 8번째 claim 시도 | 409, code=REWARDED_MONTHLY_EXHAUSTED |
| AC-04 | GET /rewarded/status (당일 언락 상태) | is_unlocked_today=true, today_unlock_expires_at 현재 UTC 자정 이후 |
| AC-05 | 자정 이후 GET /rewarded/status | is_unlocked_today=false |
| AC-06 | 다음 달 GET /rewarded/status | monthly_count=0, remaining=7, is_exhausted=false |
| AC-07 | 동시 claim 2회 (race condition) | 한 요청만 성공, count=1 (FOR UPDATE 보장) |
| AC-08 | 인증 없는 claim 요청 | 401 |

---

## 7. 주의사항

- **UTC vs KST 자정**: 현재 구현은 UTC 자정(한국 오전 9시). 수면 앱에서 새벽 1~8시 재생 후 자정 만료가 예상보다 일찍 발생. 추후 `TIMEZONE` 환경변수 파라미터화 고려 (`Asia/Seoul` 기준 자정 = UTC 15:00).
- **AdMob SSV**: MVP에서는 클라이언트 신호 신뢰. M1에서 `POST /rewarded/ssv?...` 구글 SSV 검증 콜백 추가 권장. 현재 impl은 SSV 파라미터 없이도 동작.
- **rewarded_ad_usage 레코드 정리**: 이전 달 레코드는 쿼리에서 자동 제외. 누적 데이터 용량 이슈가 없는 MVP에서는 정리 불필요. 1년 이상 운영 시 Celery cleanup task 추가.
- **`apps/api/app/api/v1/__init__.py` 라우터 등록**: `from app.api.v1 import rewarded` + `router.include_router(rewarded.router)` 패턴. 기존 auth, recordings, generations 패턴 참조.
