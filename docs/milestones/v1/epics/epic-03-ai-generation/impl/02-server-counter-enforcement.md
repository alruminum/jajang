---
depth: deep
design: skipped
---

# impl/02 — 서버: 생성 횟수 카운터 enforcement + 멱등 job_id 처리

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 6 (AI 생성 횟수 카운터 무료 3회 제한), Story 2 (멱등 재시도)  
**선행 조건**: impl/01 완료 (GeneratedTrack ORM, 003 migration)  
**예상 소요**: 3~4시간

> **depth: deep 이유**: 생성 횟수 제한은 금전적 영향이 있는 비즈니스 로직.
> SELECT FOR UPDATE 트랜잭션 경계, 카운터 원복 조건, 멱등성 보장이 모두 보안 민감 영역.
> 잘못된 구현 = 무료 유저가 무제한 생성 가능하거나, 정당한 유저에게 이중 차감 발생.

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── services/
│   └── counter_service.py          [신규 — CounterService (SELECT FOR UPDATE 트랜잭션)]
├── schemas/
│   └── generations.py              [신규 — GenerationInitRequest/Response, GenerationStatusResponse]
└── models/
    └── generation_counter.py       [신규 — GenerationCounter ORM (Epic 01에서 미분리된 경우 신규)]
```

---

## 2. GenerationCounter ORM (Epic 01 미작성 시 신규)

```python
# apps/api/app/models/generation_counter.py
# Epic 01 범위에서 이미 작성됐으면 이 파일 스킵.
# 없으면 신규 생성 후 004_generation_counters.py migration 추가.

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.db import Base


class GenerationCounter(Base):
    __tablename__ = "generation_counters"

    user_id           = Column(
                          UUID(as_uuid=True),
                          ForeignKey("users.id", ondelete="CASCADE"),
                          primary_key=True,
                        )
    count             = Column(Integer, nullable=False, default=0)
    last_generated_at = Column(DateTime(timezone=True), nullable=True)
    updated_at        = Column(
                          DateTime(timezone=True),
                          nullable=False,
                          default=lambda: datetime.now(timezone.utc),
                        )

    user = relationship("User", back_populates="generation_counter")

    __table_args__ = (
        CheckConstraint("count >= 0", name="chk_counter_non_negative"),
    )
```

---

## 3. Pydantic 스키마

```python
# apps/api/app/schemas/generations.py

import uuid
from pydantic import BaseModel, Field
from typing import Literal, Optional


class GenerationInitRequest(BaseModel):
    """
    POST /generations/init — 생성 잡 등록 요청.
    job_id: 클라이언트가 생성한 UUID (멱등성 키). 재시도 시 동일 값 전달.
    """
    job_id:          uuid.UUID
    voice_sample_id: uuid.UUID   # Epic 02에서 검증 통과한 sample_id
    song_key:        Literal['brahms', 'mozart', 'schubert', 'twinkle', 'rockabye', 'hush']


class GenerationInitResponse(BaseModel):
    job_id:          str
    track_id:        str
    status:          Literal['pending', 'processing', 'completed', 'failed']
    is_new:          bool    # True = 신규 등록, False = 기존 job_id 멱등 반환
    # is_new=False 시 클라이언트는 폴링으로 현재 상태 확인


class GenerationStatusResponse(BaseModel):
    job_id:           str
    track_id:         str
    status:           Literal['pending', 'processing', 'completed', 'failed']
    presigned_url:    Optional[str]    # status='completed' 시만 존재 (1h 만료)
    error_message:    Optional[str]    # status='failed' 시만 존재
    queue_position:   Optional[int]    # 큐 대기 중일 때 (향후 구현)


class CounterStatusResponse(BaseModel):
    """GET /generations/counter — 클라이언트 횟수 UI 동기화용"""
    count:            int
    limit:            int              # 무료 = 3, 프리미엄 = None 대신 매우 큰 값 사용
    remaining:        int
    is_free_tier:     bool
```

---

## 4. CounterService — SELECT FOR UPDATE 트랜잭션

```python
# apps/api/app/services/counter_service.py

import uuid
import structlog
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import HTTPException, status

from app.models.generation_counter import GenerationCounter
from app.models.generated_track import GeneratedTrack
from app.models.voice_sample import VoiceSample
from app.schemas.generations import GenerationInitRequest, GenerationInitResponse

logger = structlog.get_logger()

FREE_TIER_LIMIT = 3
PAID_ENTITLEMENTS = {"trial", "premium"}


async def check_and_reserve(
    db: AsyncSession,
    user_id: uuid.UUID,
    entitlement: str,
    req: GenerationInitRequest,
) -> GenerationInitResponse:
    """
    생성 잡 등록 전 횟수 체크 + 멱등성 처리.

    흐름:
    1. 동일 job_id 기존 레코드 확인 (멱등성)
    2. 무료 유저: SELECT FOR UPDATE로 카운터 잠금 → 횟수 체크
    3. voice_sample 유효성 검증 (소유권 + validated 상태)
    4. GeneratedTrack 레코드 생성 (status='pending')
    5. Celery task 큐 등록은 호출자(generation_pipeline)에서 담당

    결정: 카운터 +1은 이 함수에서 하지 않는다.
    최종 성공(completed) 시 pipeline에서 increment_on_success()를 별도 호출.
    이렇게 분리하면 GPU 추론 실패 시 카운터가 증가하지 않는다.
    단, 클라이언트 재시도는 동일 job_id로 처리되어 카운터 이중 예약 자체가 불가.
    """

    # ── Step 1: 멱등성 체크 ─────────────────────────────────────
    existing_result = await db.execute(
        select(GeneratedTrack).where(GeneratedTrack.job_id == req.job_id)
    )
    existing = existing_result.scalar_one_or_none()

    if existing is not None:
        logger.info(
            "generation.idempotent.hit",
            user_id=str(user_id),
            job_id=str(req.job_id),
            status=existing.status,
        )
        return GenerationInitResponse(
            job_id=str(req.job_id),
            track_id=str(existing.id),
            status=existing.status,
            is_new=False,
        )

    # ── Step 2: 횟수 체크 (무료 유저만) ────────────────────────
    if entitlement not in PAID_ENTITLEMENTS:
        # SELECT FOR UPDATE: 동시 요청 시 하나만 통과, 나머지는 대기
        counter_result = await db.execute(
            select(GenerationCounter)
            .where(GenerationCounter.user_id == user_id)
            .with_for_update()
        )
        counter = counter_result.scalar_one_or_none()

        if counter is None:
            # generation_counters 레코드 미생성 케이스 방어
            # 정상 가입 흐름에서는 Epic 01 auth에서 생성됨
            # 누락 시 여기서 생성 (upsert 패턴)
            counter = GenerationCounter(user_id=user_id, count=0)
            db.add(counter)
            await db.flush()  # id 확보 (commit 전)

        if counter.count >= FREE_TIER_LIMIT:
            logger.warning(
                "generation.counter.exhausted",
                user_id=str(user_id),
                count=counter.count,
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "GENERATION_LIMIT_EXCEEDED",
                    "message": "무료 생성 횟수를 모두 사용했어요. 구독하면 계속 만들 수 있어요.",
                    "current_count": counter.count,
                    "limit": FREE_TIER_LIMIT,
                },
            )

    # ── Step 3: voice_sample 유효성 검증 ───────────────────────
    sample_result = await db.execute(
        select(VoiceSample).where(
            VoiceSample.id == req.voice_sample_id,
            VoiceSample.user_id == user_id,
            VoiceSample.deleted_at.is_(None),
        )
    )
    sample = sample_result.scalar_one_or_none()

    if sample is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="녹음 파일을 찾을 수 없어요. 다시 녹음해주세요.",
        )

    if sample.status not in ("validated", "generation_started"):
        # 'validated': Epic 02 impl/03 quality_check_service가 통과시킨 상태
        # 'generation_started': 이미 생성 시작된 샘플 (재시도 허용)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "SAMPLE_NOT_VALIDATED",
                "message": "녹음 품질 검증이 완료되지 않았어요. 다시 녹음해주세요.",
                "sample_status": sample.status,
            },
        )

    # ── Step 4: GeneratedTrack 생성 ────────────────────────────
    track = GeneratedTrack(
        user_id=user_id,
        voice_sample_id=req.voice_sample_id,
        job_id=req.job_id,
        song_key=req.song_key,
        status="pending",
    )
    db.add(track)

    # voice_sample 상태 업데이트 (generation_started)
    sample.status = "generation_started"

    await db.commit()

    logger.info(
        "generation.job.created",
        user_id=str(user_id),
        job_id=str(req.job_id),
        track_id=str(track.id),
        song_key=req.song_key,
        entitlement=entitlement,
    )

    return GenerationInitResponse(
        job_id=str(req.job_id),
        track_id=str(track.id),
        status="pending",
        is_new=True,
    )


async def increment_on_success(
    db: AsyncSession,
    user_id: uuid.UUID,
    entitlement: str,
) -> None:
    """
    GPU 추론 성공 후 호출. 무료 유저만 카운터 +1.
    Celery task 완료 콜백에서 호출 (impl/04 generation_pipeline).
    이 함수는 트랜잭션 내에서 호출돼야 한다 (track.status='completed' 업데이트와 동일 트랜잭션).
    """
    if entitlement in PAID_ENTITLEMENTS:
        return  # 프리미엄/트라이얼은 카운터 변경 없음

    await db.execute(
        update(GenerationCounter)
        .where(GenerationCounter.user_id == user_id)
        .values(
            count=GenerationCounter.count + 1,
            last_generated_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    logger.info("generation.counter.incremented", user_id=str(user_id))


async def get_counter_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    entitlement: str,
) -> dict:
    """GET /generations/counter — 클라이언트 횟수 UI 동기화."""
    if entitlement in PAID_ENTITLEMENTS:
        return {
            "count": 0,
            "limit": 9999,
            "remaining": 9999,
            "is_free_tier": False,
        }

    result = await db.execute(
        select(GenerationCounter).where(GenerationCounter.user_id == user_id)
    )
    counter = result.scalar_one_or_none()
    count = counter.count if counter else 0

    return {
        "count": count,
        "limit": FREE_TIER_LIMIT,
        "remaining": max(0, FREE_TIER_LIMIT - count),
        "is_free_tier": True,
    }
```

---

## 5. 에러 코드 → 클라이언트 동작 매핑

| HTTP Status | code | 클라이언트 동작 |
|---|---|---|
| 402 | `GENERATION_LIMIT_EXCEEDED` | S14 업그레이드 팝업 (generation_exhausted variant) |
| 404 | — | "녹음 파일을 찾을 수 없어요" 토스트 + S08(녹음 모드 선택)으로 리셋 |
| 422 | `SAMPLE_NOT_VALIDATED` | "녹음 품질을 다시 확인해줘요" 토스트 + S11(미리듣기)로 복귀 |

---

## 6. 설계 결정 근거

### SELECT FOR UPDATE 트랜잭션 범위

**대안 1**: 낙관적 잠금 (optimistic locking) — count에 version 컬럼 추가, UPDATE WHERE version = old  
기각 이유: 동시 요청 충돌 시 재시도 로직 클라이언트에 전파됨. 모바일 환경에서 재시도 UX 복잡.

**대안 2**: Redis atomic INCR/DECR — counter를 DB 외 Redis에서 관리  
기각 이유: Redis 장애 시 counter와 DB 불일치. 소규모 서비스에서 단일 DB 의존이 운영 단순.

**채택**: SELECT FOR UPDATE는 단순하고 PostgreSQL이 직접 보장. 트래픽이 적은 초기 단계에 적합. 확장 시 (동시 요청 > 100/s) Redis 패턴으로 migration.

### 카운터 +1 시점: 초기 예약 vs 최종 성공

**초기 예약 방식** (대안): check_and_reserve에서 즉시 +1, 실패 시 -1  
기각 이유: 실패 원복(-1) 로직이 복잡. Celery worker 크래시 시 원복 보장이 어려움 (분산 환경).

**채택 (최종 성공 시 +1)**: GPU 추론이 completed 상태로 전환될 때 동일 트랜잭션에서 +1. 실패 시 counter는 변경 없음. 재시도는 동일 job_id로 처리 — counter 예약 자체가 발생하지 않음.

### voice_sample 소유권 검증을 이 레이어에서

**이유**: impl/02는 generation의 "게이트" 역할. voice_sample이 다른 유저의 것이거나 삭제됐거나 검증 미통과 상태라면 generation 요청을 허용해선 안 됨. 이 검증을 pipeline(impl/04)으로 미루면 Celery task를 픽업한 후 실패 — 카운터는 소비하지 않았지만 worker 리소스 낭비.

---

## 7. 수용 기준

### 카운터 체크
- [ ] 무료 유저, count=0 → 생성 허용 (HTTP 201)
- [ ] 무료 유저, count=2 → 생성 허용, 완료 후 count=3
- [ ] 무료 유저, count=3 → HTTP 402 + `GENERATION_LIMIT_EXCEEDED`
- [ ] 프리미엄 유저, count=99 → 생성 허용 (횟수 무제한)

### 멱등성
- [ ] 동일 job_id 두 번 POST → 두 번째 요청은 `is_new=false` + 기존 track_id 반환
- [ ] status='failed' 레코드에 동일 job_id → `is_new=false` + failed 상태 반환 (재생성은 새 job_id로)

### voice_sample 검증
- [ ] 다른 유저의 sample_id → HTTP 404
- [ ] status='uploaded' 샘플 → HTTP 422 `SAMPLE_NOT_VALIDATED`
- [ ] status='validated' 샘플 → 정상 통과

### 동시성
- [ ] 동일 유저 count=2 상태에서 동시 요청 2개 → 하나만 성공, 하나는 402 (SELECT FOR UPDATE 보장)

### increment_on_success
- [ ] 무료 유저 성공 후 counter.count +1 DB 확인
- [ ] 프리미엄 유저 성공 후 counter 변경 없음

---

## 8. 주의사항

- `check_and_reserve`의 `with_for_update()` 쿼리는 트랜잭션 외부에서 호출되면 잠금이 즉시 해제된다. `async with db.begin()` 블록 안에서 호출하거나, FastAPI 의존성으로 트랜잭션 범위를 보장해야 한다. impl/04 generation_pipeline 라우터에서 호출 시 db 세션 트랜잭션 범위 확인 필수.
- `entitlement` 값은 JWT 페이로드에서 읽거나 subscriptions 테이블을 조회해서 얻는다. JWT에서 읽는 경우 만료된 트라이얼의 entitlement가 stale할 수 있다. 보수적으로 구독 상태 실시간 조회 방식 권장 (impl/04에서 결정).
- 신규 유저 가입 시 `generation_counters` 레코드를 생성하는 책임은 Epic 01 auth 레이어에 있다. 이 파일은 방어적으로 레코드 없으면 insert하되, 정상 경우가 아님을 로그로 기록해야 한다.
- `HTTP 402 Payment Required`를 사용한다. `HTTP 403 Forbidden`은 "권한 없음"으로 혼동될 수 있으며, 402가 의미상 더 정확하다 (접근 자체는 합법이지만 결제 필요).
