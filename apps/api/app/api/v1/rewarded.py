import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.core.db import get_db
from app.schemas.rewarded import (
    RewardedClaimRequest,
    RewardedClaimResponse,
    RewardedStatusResponse,
)
from app.services.rewarded_service import claim_rewarded, get_rewarded_status

router = APIRouter(prefix="/rewarded", tags=["rewarded"])


@router.get("/status", response_model=RewardedStatusResponse)
async def rewarded_status(
    user_id: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> RewardedStatusResponse:
    """현재 월 Rewarded Ad 사용 상태 조회"""
    status_data = await get_rewarded_status(db, uuid.UUID(user_id))
    return RewardedStatusResponse(**status_data)


@router.post("/claim", response_model=RewardedClaimResponse)
async def rewarded_claim(
    _req: RewardedClaimRequest,
    user_id: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> RewardedClaimResponse:
    """
    Rewarded Ad 시청 완료 후 서버 카운터 업데이트 + 당일 언락 등록.
    409: 이미 월 7회 소진
    """
    claim_data = await claim_rewarded(db, uuid.UUID(user_id))
    return RewardedClaimResponse(**claim_data)
