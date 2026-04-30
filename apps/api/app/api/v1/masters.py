import uuid

import structlog
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth_with_entitlement
from app.core.db import get_db
from app.models.master_audio import MasterAudio
from app.models.recording_session import RecordingSession
from app.schemas.sessions import MasterAudioItem, MastersListResponse
from app.services import storage_service

router = APIRouter(prefix="/masters", tags=["masters"])
logger = structlog.get_logger()


@router.get("/me", response_model=MastersListResponse)
async def get_my_masters(
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """
    S06 홈 화면용: 완료된 master_audios 목록 + has_pending 플래그.
    has_pending=True → "생성 완료 음원 있음" 카드 노출 여부.
    """
    user_id = uuid.UUID(auth["sub"])

    # 완료된 마스터 목록
    result = await db.execute(
        select(MasterAudio, RecordingSession)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status == "completed",
        )
        .order_by(MasterAudio.completed_at.desc())
    )
    rows = result.all()

    items = []
    for master, session in rows:
        presigned_url = storage_service.generate_presigned_url(master.s3_key)
        items.append(MasterAudioItem(
            session_id=str(session.id),
            song_key=session.song_key,
            presigned_url=presigned_url,
            completed_at=master.completed_at,
            dsp_duration_ms=master.dsp_duration_ms,
        ))

    # pending 체크 (S06 "생성 완료 음원 있음" 카드)
    pending_result = await db.execute(
        select(MasterAudio.id)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status.in_(["pending", "processing"]),
        )
        .limit(1)
    )
    has_pending = pending_result.scalar_one_or_none() is not None

    return MastersListResponse(items=items, has_pending=has_pending)
