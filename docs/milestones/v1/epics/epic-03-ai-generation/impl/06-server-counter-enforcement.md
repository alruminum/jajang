---
depth: std
---

# impl/06 — [Story 6 / #196] 서버: 카운터 enforcement + Trial 인지 entitlement

**Epic**: 03 — DSP 음원 후처리 생성
**커버 스토리**: Story 6 (DSP 생성 횟수 카운터 서버사이드 enforcement)
**선행 조건**: impl/01 (RecordingSession FK→users), impl/02 (DSP task 의 counter +1), impl/03 (`/sessions/init` 의 카운터 체크 호출)
**예상 소요**: 3~4시간

> **[v1.3.1 신규]** 구 impl/02(`CounterService` 단독 파일) 폐기. v1.3.1 은 카운터 로직을 `session_service.init_session()` + `dsp_process_task` 두 군데로 분산 — 본 impl 은 (a) Trial 인지 entitlement 평가 함수 / (b) `auth deps` 의 entitlement 주입 / (c) generation_counters 테이블 race-safe 쿼리 패턴을 *재사용 가능 단위로 추출*.
> **scope 분리**: impl/03 §4 의 카운터 SELECT FOR UPDATE 는 *이미 작성됨*. 본 impl 은 그 코드를 `entitlement_service` + `counter_repo` 로 *분해 + 재사용 가능화*.

---

## 1. 생성/수정 파일

```
apps/api/app/
├── services/
│   ├── entitlement_service.py           [신규 — Trial 인지 평가 + Premium 우선순위]
│   └── counter_repo.py                  [신규 — generation_counters race-safe 헬퍼]
├── api/
│   └── deps.py                          [수정 — require_auth_with_entitlement 가 trial_expires_at 평가]
├── services/
│   └── session_service.py               [수정 — counter_repo 호출로 리팩터]
├── tasks/
│   └── dsp_processing.py                [수정 — counter_repo.increment_if_free 호출]
└── core/
    └── constants.py                     [신규 — FREE_GENERATION_LIMIT=3, TRIAL_DAYS=7]

apps/api/tests/
└── test_entitlement.py                  [신규 — Trial 진입/만료/Premium 매트릭스]
```

---

## 2. 인터페이스

```python
# services/entitlement_service.py
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

def is_premium_or_trial(entitlement: str) -> bool:
    """카운터 skip 여부 (entitlement IN ('premium', 'trial'))."""

def is_active_trial(trial_expires_at: datetime | None, now: datetime) -> bool:
    """trial_expires_at 이 미래인가."""
```

```python
# services/counter_repo.py
async def get_count_for_update(db: AsyncSession, user_id: UUID) -> int:
    """SELECT count FROM generation_counters WHERE user_id=? FOR UPDATE. 부재 시 0 반환."""

async def assert_below_limit_or_raise(
    db: AsyncSession, user_id: UUID, entitlement: str
) -> None:
    """entitlement='free' + count >= FREE_GENERATION_LIMIT 시 HTTPException 402 GENERATION_LIMIT_EXCEEDED."""

def increment_if_free_sync(
    db: SyncSession, user_id: UUID, entitlement: str, now: datetime
) -> None:
    """Celery task 전용 (sync). entitlement='free' 만 count += 1 + last_generated_at + updated_at."""
```

```python
# api/deps.py
async def require_auth_with_entitlement(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    JWT 검증 + Subscription/Trial 평가 → dict.
    반환: {"sub": user_id, "email": ..., "entitlement": "free"|"trial"|"premium"}
    """
```

---

## 3. 의사코드

```python
# core/constants.py
FREE_GENERATION_LIMIT = 3
TRIAL_DAYS = 7
PREMIUM_ENTITLEMENTS = frozenset({"premium", "trial"})  # 카운터 skip 대상
```

```python
# services/entitlement_service.py
from datetime import datetime, timezone

def is_active_trial(trial_expires_at, now):
    return trial_expires_at is not None and trial_expires_at > now

def evaluate_entitlement(is_active_subscription, trial_expires_at, now):
    if is_active_subscription:
        return "premium"
    if is_active_trial(trial_expires_at, now):
        return "trial"
    return "free"

def is_premium_or_trial(entitlement):
    return entitlement in PREMIUM_ENTITLEMENTS
```

```python
# services/counter_repo.py
from sqlalchemy import select, update
from fastapi import HTTPException, status
from app.core.constants import FREE_GENERATION_LIMIT
from app.models.generation_counter import GenerationCounter


async def get_count_for_update(db, user_id):
    row = (await db.execute(
        select(GenerationCounter)
        .where(GenerationCounter.user_id == user_id)
        .with_for_update()
    )).scalar_one_or_none()
    return row.count if row else 0


async def assert_below_limit_or_raise(db, user_id, entitlement):
    if entitlement != "free":
        return
    count = await get_count_for_update(db, user_id)
    if count >= FREE_GENERATION_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "GENERATION_LIMIT_EXCEEDED", "count": count},
        )


def increment_if_free_sync(db, user_id, entitlement, now):
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
```

```python
# api/deps.py
from app.services.entitlement_service import evaluate_entitlement
from app.models.subscription import Subscription
from datetime import datetime, timezone

async def require_auth_with_entitlement(request, db):
    payload = await _verify_jwt(request)            # 기존 require_auth 로직 재사용
    user_id = uuid.UUID(payload["sub"])

    sub = (await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )).scalar_one_or_none()

    is_active = sub.is_active if sub else False
    trial_expires = sub.trial_expires_at if sub else None
    entitlement = evaluate_entitlement(is_active, trial_expires, datetime.now(timezone.utc))

    return {
        "sub": str(user_id),
        "email": payload.get("email"),
        "entitlement": entitlement,
    }
```

```python
# services/session_service.py — 리팩터 (impl/03 §4 코드 교체)
from app.services.counter_repo import assert_below_limit_or_raise

async def init_session(db, user_id, entitlement, body):
    await assert_below_limit_or_raise(db, user_id, entitlement)   # 1줄로 단순화
    # ... (이하 멱등성 체크 + 신규 세션 생성 — impl/03 §4 동일)
```

```python
# tasks/dsp_processing.py — Step 6 리팩터
from app.services.counter_repo import increment_if_free_sync

# (DB 업데이트 블록 내)
increment_if_free_sync(db, _user_id, entitlement, datetime.now(timezone.utc))
db.commit()
```

---

## 4. 결정 근거

### 경로 A (entitlement 토큰/응답 body 포함) 채택 — system-design.md §2.2 정합
- `require_auth_with_entitlement` 가 매 요청마다 Subscription 조회 (1 query) → 캐시 X (1 RTT 의 cost < cache invalidation 복잡도)
- 클라이언트는 로그인/refresh 응답 body 의 `trial_expires_at` 으로 UI gating mirror — 로컬 evaluate 가능

### Trial 만료 후 카운터 보존 (PRD §F14)
- `generation_counters` 는 *Trial 진입 전* 카운트만 누적
- Trial 기간 생성 = `entitlement="trial"` 분기 → `increment_if_free_sync` 가 early-return
- Trial 만료 후 자동 다운그레이드 시 기존 count 그대로 → "Trial 진입 전 2회 소진 + Trial 중 5회 생성" → 만료 후 count=2 (1회 추가 가능). 소급 가산 X.

### `with_for_update` 동시성 가드
- 무료 유저 동시 2 요청 (count=2 상태) 시 race → 둘 다 통과해서 count=4 만들 위험
- `SELECT ... FOR UPDATE` + 트랜잭션 끝까지 lock 유지 → 직렬화

### counter +1 시점: DSP 성공 직후 (init 시점 X)
- init 시점에 +1 하면 DSP 실패 + 재시도 시 정확한 차감 어려움
- DSP 완료 시점에 +1 → 실패 시 자연스럽게 차감 X (재시도 동일 session_id 로 동작)

---

## 5. 다른 모듈 경계

- **impl/01 (`subscription.py`)**: `trial_expires_at` 컬럼 *재사용* (Epic 01 산출, 추가 마이그레이션 X). 본 impl 은 read-only.
- **impl/03 (`session_service.py`)**: §4 의 카운터 SELECT FOR UPDATE 인라인 코드 → 본 impl 의 `assert_below_limit_or_raise` 호출로 *교체*.
- **impl/02 (`dsp_processing.py`)**: §5 Step 6 의 `if entitlement == "free": db.execute(update(GenerationCounter)...)` 인라인 → `increment_if_free_sync(...)` 1줄로 *교체*.
- **Epic 09 (Trial 진입 시점)**: `auth/google` 가입 완료 시 `subscriptions.trial_expires_at = NOW() + 7days` set (Epic 09 책임). 본 impl 은 set 된 값을 *읽기만*.
- **Epic 10 (Trial D-1 알림)**: Celery Beat `trial_expiry_notify` (Epic 10 책임). 본 impl 의 `evaluate_entitlement` 결과를 push 메시지에 활용.

---

## 6. 수용 기준

- [ ] (TEST) `evaluate_entitlement(is_active=True, trial=None, now)` → `"premium"`
- [ ] (TEST) `evaluate_entitlement(is_active=False, trial=NOW+1d, now)` → `"trial"`
- [ ] (TEST) `evaluate_entitlement(is_active=False, trial=NOW-1d, now)` → `"free"`
- [ ] (TEST) `evaluate_entitlement(is_active=True, trial=NOW+1d, now)` → `"premium"` (subscription 우선)
- [ ] (TEST) 무료 유저 count=3 → `POST /sessions/init` → 402 `GENERATION_LIMIT_EXCEEDED`
- [ ] (TEST) Trial 유저 count=10 → `POST /sessions/init` → 201 (skip)
- [ ] (TEST) Premium 유저 count=10 → `POST /sessions/init` → 201 (skip)
- [ ] (TEST) Trial 유저 DSP 완료 → counter 변경 X (count 그대로)
- [ ] (TEST) 무료 유저 DSP 완료 → `count += 1` + `last_generated_at` + `updated_at`
- [ ] (TEST) 무료 유저 DSP 실패 → counter 변경 X
- [ ] (TEST) 무료 유저 동시 2 요청 (count=2) → 한 요청만 201, 다른 하나는 402 또는 정상 처리 후 후속 +1 시점 직렬화
- [ ] (TEST) Trial 진입 전 count=2 → Trial 7일 동안 5회 생성 → Trial 만료 후 count=2 유지 (소급 가산 X)
- [ ] (TEST) `require_auth_with_entitlement` 응답 dict 에 `entitlement` 키 존재

---

## 7. 주의사항

- `with_for_update` 가 트랜잭션 끝까지 lock 유지. `init_session` 의 `await db.commit()` 이 빠르게 호출되어야 long lock 회피 (현재 구조: 카운터 체크 → 멱등성 조회 → INSERT → commit, ~50ms 내).
- `evaluate_entitlement(now=...)` 의 `now` 는 항상 UTC. timezone-naive datetime 전달 시 비교 오류 가능 → `datetime.now(timezone.utc)` 강제.
- `generation_counters` row 가 *부재* 한 신규 유저 → `get_count_for_update` 가 0 반환. 첫 DSP 완료 시 INSERT 가 아닌 UPDATE 실행 → row 없으면 silent no-op. **신규 유저 회원가입 시 `generation_counters` row INSERT 가 Epic 01 책임 인지 확인 필요**. 부재 시 별도 fallback (UPSERT) 추가 — engineer 단계에서 검증.
- `is_premium_or_trial` 헬퍼는 호출처 가독성용. 내부적으론 `entitlement != "free"` 와 동치.

---

MODULE_PLAN_READY
