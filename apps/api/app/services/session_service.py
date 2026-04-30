import uuid

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generation_counter import GenerationCounter
from app.models.master_audio import MasterAudio
from app.models.recording_session import RecordingSession
from app.schemas.sessions import SessionInitRequest, SessionInitResponse
from app.services import storage_service
from app.services.counter_service import FREE_TIER_LIMIT, PAID_ENTITLEMENTS

logger = structlog.get_logger()


async def init_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    entitlement: str,
    body: SessionInitRequest,
) -> SessionInitResponse:
    """
    세션 생성.
    1. 카운터 체크 (무료 유저만, SELECT FOR UPDATE)
    2. idempotency_key로 기존 세션 조회 → 있으면 반환 (멱등)
    3. RecordingSession + MasterAudio INSERT
    4. presigned PUT URL 발급
    """
    # ── 1. 카운터 체크 (무료 유저) ─────────────────────────────────
    if entitlement not in PAID_ENTITLEMENTS:
        result = await db.execute(
            select(GenerationCounter)
            .where(GenerationCounter.user_id == user_id)
            .with_for_update()
        )
        counter = result.scalar_one_or_none()
        if counter and counter.count >= FREE_TIER_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "GENERATION_LIMIT_EXCEEDED", "count": counter.count},
            )

    # ── 2. 멱등성 체크 ────────────────────────────────────────────
    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.idempotency_key == body.idempotency_key)
    )
    existing = result.scalar_one_or_none()
    if existing:
        # 기존 세션 presigned URL 재발급
        s3_key = f"recordings/{existing.id}/clip_{uuid.uuid4()}.m4a"
        presigned_url = storage_service.generate_presigned_put_url(s3_key)
        return SessionInitResponse(
            session_id=str(existing.id),
            presigned_upload_url=presigned_url,
            s3_key=s3_key,
            is_new=False,
        )

    # ── 3. 신규 세션 생성 ─────────────────────────────────────────
    session = RecordingSession(
        user_id=user_id,
        song_key=body.song_key,
        idempotency_key=body.idempotency_key,
    )
    db.add(session)
    await db.flush()  # session.id 확보

    master = MasterAudio(session_id=session.id)
    db.add(master)
    await db.commit()

    # ── 4. presigned PUT URL ────────────────────────────────────
    s3_key = f"recordings/{session.id}/clip_{uuid.uuid4()}.m4a"
    presigned_url = storage_service.generate_presigned_put_url(s3_key)

    return SessionInitResponse(
        session_id=str(session.id),
        presigned_upload_url=presigned_url,
        s3_key=s3_key,
        is_new=True,
    )
