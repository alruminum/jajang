from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.generated_track import GeneratedTrack
from app.models.subscription import Subscription
from app.models.user import User
from app.models.voice_sample import VoiceSample
from app.schemas.users import AccountDeletionResponse
from app.services import storage_service

logger = logging.getLogger(__name__)


class AccountDeletionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def delete_account(self, user: User) -> AccountDeletionResponse:
        """계단형 삭제 오케스트레이터."""
        await self._guard_active_subscription(user.id)
        await self._delete_s3_voice_samples(user.id)
        await self._delete_s3_generated_tracks(user.id)
        await self._soft_delete_user(user)
        await self._write_audit_log(user, action="account_deletion_requested")
        await self.db.commit()

        return AccountDeletionResponse(
            status="deletion_scheduled",
            message="계정과 모든 데이터를 삭제했어요.",
        )

    # ------------------------------------------------------------------ #
    # private helpers
    # ------------------------------------------------------------------ #

    async def _guard_active_subscription(self, user_id: uuid.UUID) -> None:
        """구독 활성 상태면 422 — 클라이언트가 먼저 취소하도록 유도."""
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.is_active == True,  # noqa: E712
            )
        )
        sub = result.scalar_one_or_none()
        if sub is None:
            return

        # revenuecat_customer_id는 플랫폼 판단에 신뢰성 없음.
        # V1: iOS 우선 앱 특성상 기본값 'ios' 사용 (V2에서 platform 컬럼 추가 예정).
        platform = "ios"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "ACTIVE_SUBSCRIPTION",
                "message": "구독을 먼저 취소해주세요. 앱스토어/플레이스토어에서 진행할 수 있어요.",
                "subscription_platform": platform,
            },
        )

    async def _delete_s3_voice_samples(self, user_id: uuid.UUID) -> None:
        """S3 목소리 샘플 파일 삭제 후 DB status = 'deleted' 마킹."""
        result = await self.db.execute(
            select(VoiceSample).where(
                VoiceSample.user_id == user_id,
                VoiceSample.deleted_at.is_(None),
            )
        )
        samples = result.scalars().all()
        for sample in samples:
            try:
                await asyncio.to_thread(storage_service.delete_object, sample.s3_key)
            except Exception:
                # S3 삭제 실패는 치명적이지 않음 — 로그 후 계속
                logger.error(
                    "s3_delete_failed: voice_sample",
                    extra={"s3_key": sample.s3_key, "user_id": str(user_id)},
                )
            sample.deleted_at = datetime.now(timezone.utc)
            sample.status = "deleted"

    async def _delete_s3_generated_tracks(self, user_id: uuid.UUID) -> None:
        """S3 생성 음원 파일 삭제. DB 레코드는 CASCADE 삭제로 처리."""
        result = await self.db.execute(
            select(GeneratedTrack).where(
                GeneratedTrack.user_id == user_id,
                GeneratedTrack.s3_key.is_not(None),
                GeneratedTrack.status == "completed",
            )
        )
        tracks = result.scalars().all()
        for track in tracks:
            try:
                await asyncio.to_thread(storage_service.delete_object, track.s3_key)
            except Exception:
                logger.error(
                    "s3_delete_failed: generated_track",
                    extra={"s3_key": track.s3_key, "user_id": str(user_id)},
                )

    async def _soft_delete_user(self, user: User) -> None:
        """users.deleted_at 세팅 — CASCADE로 연관 테이블 DB 레코드 정리."""
        user.deleted_at = datetime.now(timezone.utc)
        self.db.add(user)

    async def _write_audit_log(self, user: User, action: str) -> None:
        log = AuditLog(
            user_id=str(user.id),
            action=action,
            metadata={
                "provider": user.provider,
                "email": user.email,
                "entitlement": None,
            },
        )
        self.db.add(log)
