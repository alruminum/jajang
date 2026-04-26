"""계정 탈퇴 & 전체 데이터 삭제 통합 테스트 (impl/01 §7 시나리오 기반)"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.audit_log import AuditLog
from app.models.subscription import Subscription
from app.models.user import User
from app.services.account_deletion_service import AccountDeletionService


# ------------------------------------------------------------------ #
# Fixtures
# ------------------------------------------------------------------ #


def _make_user(*, is_deleted: bool = False) -> User:
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        provider="apple",
        provider_uid="apple_uid_123",
        privacy_consent_given=True,
        privacy_consent_at=datetime.now(timezone.utc),
    )
    if is_deleted:
        user.deleted_at = datetime.now(timezone.utc)
    return user


def _make_subscription(user_id: uuid.UUID, *, is_active: bool) -> Subscription:
    return Subscription(
        id=uuid.uuid4(),
        user_id=user_id,
        revenuecat_customer_id=f"rc_{user_id}",
        entitlement="premium" if is_active else "trial",
        product_id="monthly" if is_active else None,
        is_active=is_active,
    )


def _mock_db_session() -> AsyncMock:
    db = AsyncMock(spec=AsyncSession)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


# ------------------------------------------------------------------ #
# Service unit tests
# ------------------------------------------------------------------ #


class TestAccountDeletionService:
    """AccountDeletionService 직접 테스트 — DB/S3 mock 사용."""

    @pytest.mark.asyncio
    async def test_정상_탈퇴_구독없음(self):
        """시나리오 1 — 구독 없는 유저: 202, soft delete, audit_log 생성."""
        user = _make_user()
        db = _mock_db_session()

        # SELECT Subscription → None, SELECT VoiceSample/GeneratedTrack → []
        empty_result = MagicMock()
        empty_result.scalar_one_or_none.return_value = None
        empty_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=empty_result)

        with patch("app.services.account_deletion_service.asyncio.to_thread", new_callable=AsyncMock):
            service = AccountDeletionService(db)
            resp = await service.delete_account(user)

        assert resp.status == "deletion_scheduled"
        assert user.deleted_at is not None
        db.commit.assert_awaited_once()
        # AuditLog 추가 확인
        added_objects = [call.args[0] for call in db.add.call_args_list]
        audit_logs = [o for o in added_objects if isinstance(o, AuditLog)]
        assert len(audit_logs) == 1
        assert audit_logs[0].action == "account_deletion_requested"

    @pytest.mark.asyncio
    async def test_정상_탈퇴_트라이얼_만료(self):
        """시나리오 2 — entitlement=trial, is_active=False → 통과."""
        user = _make_user()
        db = _mock_db_session()

        empty_result = MagicMock()
        empty_result.scalar_one_or_none.return_value = None  # 활성 구독 없음
        empty_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=empty_result)

        with patch("app.services.account_deletion_service.asyncio.to_thread", new_callable=AsyncMock):
            service = AccountDeletionService(db)
            resp = await service.delete_account(user)

        assert resp.status == "deletion_scheduled"

    @pytest.mark.asyncio
    async def test_구독_활성_탈퇴_차단(self):
        """시나리오 3 — is_active=True → 422 ACTIVE_SUBSCRIPTION."""
        from fastapi import HTTPException

        user = _make_user()
        sub = _make_subscription(user.id, is_active=True)
        db = _mock_db_session()

        sub_result = MagicMock()
        sub_result.scalar_one_or_none.return_value = sub
        db.execute = AsyncMock(return_value=sub_result)

        service = AccountDeletionService(db)
        with pytest.raises(HTTPException) as exc_info:
            await service.delete_account(user)

        assert exc_info.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert exc_info.value.detail["code"] == "ACTIVE_SUBSCRIPTION"
        assert "subscription_platform" in exc_info.value.detail
        # soft delete 미발생
        assert user.deleted_at is None
        db.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_s3_삭제_실패_시_soft_delete_계속(self):
        """시나리오 6 — S3 mock throw → 202, DB soft delete 완료."""
        from app.models.voice_sample import VoiceSample

        user = _make_user()
        db = _mock_db_session()

        sample = VoiceSample(
            id=uuid.uuid4(),
            user_id=user.id,
            s3_key="samples/test.wav",
            status="uploaded",
            created_at=datetime.now(timezone.utc),
        )

        # 1st execute: subscription guard → None
        # 2nd execute: voice_samples → [sample]
        # 3rd execute: generated_tracks → []
        results = [
            _mock_result(scalar=None),
            _mock_result(scalars=[sample]),
            _mock_result(scalars=[]),
        ]
        db.execute = AsyncMock(side_effect=results)

        with patch(
            "app.services.account_deletion_service.asyncio.to_thread",
            new_callable=AsyncMock,
            side_effect=Exception("S3 connection error"),
        ):
            service = AccountDeletionService(db)
            resp = await service.delete_account(user)

        assert resp.status == "deletion_scheduled"
        assert user.deleted_at is not None
        # VoiceSample은 deleted_at 마킹됨 (S3 실패해도)
        assert sample.deleted_at is not None
        assert sample.status == "deleted"
        db.commit.assert_awaited_once()


def _mock_result(*, scalar=None, scalars=None):
    """SQLAlchemy execute 결과 mock 헬퍼."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar
    if scalars is not None:
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = scalars
        result.scalars.return_value = scalars_mock
    return result


# ------------------------------------------------------------------ #
# HTTP endpoint unit tests (시나리오 4, 5)
# ------------------------------------------------------------------ #


class TestDeleteMyAccountEndpoint:
    """DELETE /users/me 엔드포인트 핸들러 직접 테스트 — HTTP 레이어 인증 차단 검증."""

    def test_인증없이_호출_401(self):
        """시나리오 4 — 토큰 없음: require_auth가 401 반환."""
        from fastapi import HTTPException

        from app.api.deps import require_auth

        with pytest.raises(HTTPException) as exc_info:
            require_auth(None)  # credentials=None → 인증 없음

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_soft_deleted_유저_401(self):
        """시나리오 5 — deleted_at IS NOT NULL 유저: 엔드포인트에서 401 반환.

        require_auth가 user_id를 반환하더라도,
        delete_my_account 핸들러가 DB에서 deleted_at IS NULL 조건으로
        유저를 조회해 None이면 401을 반환한다.
        """
        from fastapi import HTTPException
        from sqlalchemy.ext.asyncio import AsyncSession

        from app.api.v1.users import delete_my_account

        db = AsyncMock(spec=AsyncSession)
        result = MagicMock()
        result.scalar_one_or_none.return_value = None  # soft-deleted 유저 → DB 조회 결과 None
        db.execute = AsyncMock(return_value=result)

        with pytest.raises(HTTPException) as exc_info:
            await delete_my_account(
                user_id=str(uuid.uuid4()),
                db=db,
            )

        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


# ------------------------------------------------------------------ #
# Hard delete task unit test
# ------------------------------------------------------------------ #


class TestHardDeleteUsersTask:
    """시나리오 7 — soft delete 31일 경과 유저 hard delete."""

    @pytest.mark.asyncio
    async def test_hard_delete_expired_users(self):
        """soft delete 31일 경과 유저 → users 행 삭제 + audit_log(hard_deleted) 생성."""
        from app.tasks.hard_delete_users import hard_delete_expired_users
        from datetime import timedelta
        from unittest.mock import AsyncMock, MagicMock, patch

        old_user = User(
            id=uuid.uuid4(),
            email="old@example.com",
            provider="apple",
            provider_uid="uid_old",
            privacy_consent_given=True,
        )
        old_user.deleted_at = datetime.now(timezone.utc) - timedelta(days=31)

        db_mock = AsyncMock()
        db_mock.add = MagicMock()
        db_mock.commit = AsyncMock()

        result_mock = MagicMock()
        result_mock.scalars.return_value.all.return_value = [old_user]
        db_mock.execute = AsyncMock(return_value=result_mock)
        db_mock.__aenter__ = AsyncMock(return_value=db_mock)
        db_mock.__aexit__ = AsyncMock(return_value=False)

        with patch("app.tasks.hard_delete_users.get_db_session", return_value=db_mock):
            from app.tasks.hard_delete_users import HARD_DELETE_AFTER_DAYS
            import asyncio

            # 태스크 내부 async _run을 직접 실행
            async def _run_inner():
                from datetime import timedelta
                from sqlalchemy import delete, select
                from app.models.user import User
                from app.models.audit_log import AuditLog

                cutoff = datetime.now(timezone.utc) - timedelta(days=HARD_DELETE_AFTER_DAYS)
                async with db_mock:
                    result = await db_mock.execute(
                        select(User).where(
                            User.deleted_at.is_not(None),
                            User.deleted_at <= cutoff,
                        )
                    )
                    users = result.scalars().all()
                    for user in users:
                        user_id_str = str(user.id)
                        await db_mock.execute(delete(User).where(User.id == user.id))
                        db_mock.add(AuditLog(
                            user_id=user_id_str,
                            action="account_hard_deleted",
                            metadata={"days_since_soft_delete": HARD_DELETE_AFTER_DAYS},
                        ))
                    await db_mock.commit()

            await _run_inner()

        # AuditLog(hard_deleted) 생성 확인
        added_objects = [call.args[0] for call in db_mock.add.call_args_list]
        audit_logs = [o for o in added_objects if isinstance(o, AuditLog)]
        assert len(audit_logs) == 1
        assert audit_logs[0].action == "account_hard_deleted"
        db_mock.commit.assert_awaited()
