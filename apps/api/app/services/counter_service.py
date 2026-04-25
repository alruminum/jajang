import uuid
from datetime import datetime, timezone

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

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
            logger.warning(
                "generation.counter.missing",
                user_id=str(user_id),
            )
            counter = GenerationCounter(user_id=user_id, count=0)
            db.add(counter)
            await db.flush()

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
        created_at=datetime.now(timezone.utc),
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
