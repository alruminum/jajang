from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
