import uuid
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth_with_entitlement
from app.core.db import get_db
from app.schemas.sessions import MasterAudioItem, MastersListResponse
from app.services import storage_service
from app.services.masters_service import has_pending_masters, list_completed_masters

router = APIRouter(prefix="/masters", tags=["masters"])
logger = structlog.get_logger()


@router.get("/me", response_model=MastersListResponse)
async def get_my_masters(
    cursor: datetime | None = Query(default=None, description="ISO8601 completed_at (이전 페이지 마지막 값)"),
    limit: int = Query(default=20, le=50),
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
) -> MastersListResponse:
    """
    S06 홈 화면용: 완료된 master_audios 목록 + has_pending + next_cursor.
    cursor 동작: completed_at < cursor 인 row 만 반환 (keyset pagination).
    cursor 가 올바른 ISO8601 datetime 이 아닐 경우 FastAPI 422 반환.
    """
    user_id = uuid.UUID(auth["sub"])

    masters, sessions, next_cursor = await list_completed_masters(
        db=db,
        user_id=user_id,
        cursor=cursor,
        limit=limit,
    )
    has_pending = await has_pending_masters(db=db, user_id=user_id)

    items = [
        MasterAudioItem(
            session_id=str(s.id),
            song_key=s.song_key,
            presigned_url=storage_service.generate_presigned_url(m.s3_key),
            completed_at=m.completed_at,
            dsp_duration_ms=m.dsp_duration_ms,
        )
        for m, s in zip(masters, sessions)
    ]
    return MastersListResponse(
        items=items,
        has_pending=has_pending,
        next_cursor=next_cursor.isoformat() if next_cursor else None,
    )
