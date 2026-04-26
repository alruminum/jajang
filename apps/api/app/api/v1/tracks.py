import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.core.db import get_db
from app.schemas.tracks import TrackDeleteResponse, TracksListResponse
from app.services.tracks_service import delete_track, list_tracks

router = APIRouter(prefix="/tracks", tags=["tracks"])


@router.get("/", response_model=TracksListResponse)
async def get_my_tracks(
    last_checked_at: Optional[datetime] = Query(
        default=None,
        description="마지막 홈 확인 시각 (ISO8601). 이후 completed 트랙 있으면 completed_since_last_check=true.",
    ),
    include_presigned: bool = Query(
        default=True,
        description="completed 트랙에 presigned URL 포함 여부 (기본 true).",
    ),
    user_id: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    내 트랙 목록. S06 홈 화면 진입 시 호출.

    클라이언트 호출 패턴:
    1. 홈 진입 시: GET /tracks?last_checked_at={이전 진입 시각}
    2. completed_since_last_check=true → "생성 완료 카드" 노출
    3. has_pending=true → S12 Generating 화면에서 폴링 재개 (재진입 동선)
    """
    return await list_tracks(
        db=db,
        user_id=uuid.UUID(user_id),
        last_checked_at=last_checked_at,
        include_presigned=include_presigned,
    )


@router.delete("/{track_id}", response_model=TrackDeleteResponse)
async def delete_my_track(
    track_id: uuid.UUID,
    user_id: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    트랙 삭제 (S06 스와이프 → 삭제 확인).
    생성 중(pending/processing) 트랙은 409 반환.
    """
    await delete_track(db, uuid.UUID(user_id), track_id)
    return TrackDeleteResponse(id=str(track_id), deleted=True)
