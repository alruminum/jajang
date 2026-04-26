from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TrackItem(BaseModel):
    """홈 화면 트랙 카드 1개 데이터."""

    id: str
    job_id: str
    song_key: str
    song_name: str  # song_key → 한국어 곡명 변환 (서버에서 처리)
    status: str  # completed | pending | processing | failed
    presigned_url: Optional[str] = None  # status='completed'이고 요청 시 포함
    created_at: datetime
    completed_at: Optional[datetime] = None


class TracksListResponse(BaseModel):
    """
    GET /tracks 응답.
    has_pending: 현재 생성 중인 트랙 존재 여부.
    클라이언트가 홈 진입 시 이 플래그를 확인해 폴링 재개 여부 결정.
    last_checked_at: 클라이언트가 이전에 확인한 시각 이후 completed된 트랙이 있으면
    completed_since_last_check=True → "생성 완료 카드" 노출 트리거.
    """

    tracks: List[TrackItem]
    has_pending: bool  # pending 또는 processing 트랙 존재 여부
    completed_since_last_check: bool  # 백그라운드 생성 완료 감지용
    total: int


class TrackDeleteResponse(BaseModel):
    id: str
    deleted: bool
