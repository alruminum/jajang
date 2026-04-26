import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.core.db import get_db
from app.models.user import User
from app.schemas.users import AccountDeletionResponse
from app.services.account_deletion_service import AccountDeletionService

router = APIRouter(prefix="/users", tags=["users"])

# V1 DEFERRED: POST /users/me/export (데이터 내보내기)
# GDPR Art.15(열람권)은 EU 거주자에게만 적용. V1 타깃(한국)은 PIPA 적용이며
# 자동화된 내보내기 의무 없음. EU 진출 시점(V2)에 재설계 예정.
# 참조: docs/milestones/v1/epics/epic-06-privacy/impl/02-server-data-export.md


@router.delete(
    "/me",
    response_model=AccountDeletionResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="계정 탈퇴 및 전체 데이터 삭제",
)
async def delete_my_account(
    user_id: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> AccountDeletionResponse:
    """
    계정과 연결된 모든 데이터를 삭제한다.

    삭제 순서 (계단형):
      1. S3 목소리 샘플 파일 삭제
      2. S3 생성 음원 파일 삭제
      3. generated_tracks 레코드 삭제 (CASCADE로 DB 처리)
      4. voice_samples 레코드 삭제 (CASCADE)
      5. rewarded_ad_usage 삭제 (CASCADE)
      6. generation_counters 삭제 (CASCADE)
      7. subscriptions 삭제 — 단, is_active=True 이면 422 반환 (삭제 전 체크)
      8. users.deleted_at = NOW() (soft delete)
      9. audit_log 기록

    hard delete (users 행 완전 제거)는 30일 후 Celery Beat 스케줄로 처리.
    """
    result = await db.execute(
        select(User).where(
            User.id == uuid.UUID(user_id),
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")

    service = AccountDeletionService(db)
    return await service.delete_account(user)
