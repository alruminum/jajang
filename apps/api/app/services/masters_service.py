"""
masters_service — MasterAudio 목록 조회 서비스 (impl/05)

list_completed_masters: cursor 기반 페이지네이션 (keyset by completed_at DESC)
has_pending_masters: pending/processing 1건 이상 여부
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.master_audio import MasterAudio
from app.models.recording_session import RecordingSession


async def list_completed_masters(
    db: AsyncSession,
    user_id: uuid.UUID,
    cursor: datetime | None,
    limit: int,
) -> tuple[list[MasterAudio], list[RecordingSession], datetime | None]:
    """완료된 MasterAudio 목록 + 다음 cursor.

    매 호출마다 limit+1 건 fetch 후 has_more 판단.
    next_cursor = page 마지막 항목의 completed_at (has_more 시에만).
    """
    stmt = (
        select(MasterAudio, RecordingSession)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status == "completed",
            MasterAudio.completed_at.isnot(None),
        )
        .order_by(MasterAudio.completed_at.desc(), MasterAudio.id.desc())
        .limit(limit + 1)
    )
    if cursor is not None:
        stmt = stmt.where(MasterAudio.completed_at < cursor)

    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = page[-1][0].completed_at if has_more else None
    masters = [r[0] for r in page]
    sessions = [r[1] for r in page]
    return masters, sessions, next_cursor


async def has_pending_masters(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """status IN (pending, processing) 1건 이상 존재 여부."""
    stmt = (
        select(MasterAudio.id)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status.in_(["pending", "processing"]),
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
