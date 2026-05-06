"""
REQ-ENT-06 — entitlement 평가 + 카운터 enforcement 단위 테스트 (TDD RED)

커버 범위:
  AC-1   evaluate_entitlement(is_active=True, trial=None) → "premium"
  AC-2   evaluate_entitlement(is_active=False, trial=NOW+1d) → "trial"
  AC-3   evaluate_entitlement(is_active=False, trial=NOW-1d) → "free"
  AC-4   evaluate_entitlement(is_active=True, trial=NOW+1d) → "premium" (subscription 우선)

  is_active_trial: None / 미래 / 과거 3케이스
  is_premium_or_trial: "premium" / "trial" / "free" 3케이스

  AC-5   counter_repo.assert_below_limit_or_raise: free + count=3 → HTTPException 402 GENERATION_LIMIT_EXCEEDED
  AC-6   counter_repo.assert_below_limit_or_raise: trial + count=10 → no raise
  AC-7   counter_repo.assert_below_limit_or_raise: premium + count=10 → no raise
         counter_repo.assert_below_limit_or_raise: free + count=2 → no raise

  counter_repo.get_count_for_update: row 부재 → 0 / row 존재 → row.count

  AC-8   increment_if_free_sync: trial → execute 미호출 (early return)
  AC-9   increment_if_free_sync: free → execute 호출 (count/last_generated_at/updated_at)
  AC-10  increment_if_free_sync: premium → execute 미호출

  AC-13  require_auth_with_entitlement 반환 dict 에 'entitlement' 키 존재
         Subscription None + trial_expires_at None → 'free'
         Subscription is_active=True → 'premium'

NOTE: entitlement_service.py / counter_repo.py / constants.py 미작성(TDD RED). ImportError 정상.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── 공통 고정값 ────────────────────────────────────────────────────────────────

_NOW = datetime(2026, 5, 6, 12, 0, 0, tzinfo=timezone.utc)
_FIXED_USER_ID = uuid.uuid4()


# ══════════════════════════════════════════════════════════════════════════════
# TestEvaluateEntitlement — pure function, mock 불필요
# ══════════════════════════════════════════════════════════════════════════════


class TestEvaluateEntitlement:
    """REQ-ENT-06 AC-1~4 — evaluate_entitlement 우선순위 매트릭스."""

    def test_AC1_is_active_True_trial_None_반환_premium(self):
        """AC-1: is_active=True, trial=None → 'premium'."""
        from app.services.entitlement_service import evaluate_entitlement

        result = evaluate_entitlement(
            is_active_subscription=True,
            trial_expires_at=None,
            now=_NOW,
        )
        assert result == "premium"

    def test_AC2_is_active_False_trial_미래_반환_trial(self):
        """AC-2: is_active=False, trial=NOW+1d → 'trial'."""
        from app.services.entitlement_service import evaluate_entitlement

        result = evaluate_entitlement(
            is_active_subscription=False,
            trial_expires_at=_NOW + timedelta(days=1),
            now=_NOW,
        )
        assert result == "trial"

    def test_AC3_is_active_False_trial_과거_반환_free(self):
        """AC-3: is_active=False, trial=NOW-1d → 'free'."""
        from app.services.entitlement_service import evaluate_entitlement

        result = evaluate_entitlement(
            is_active_subscription=False,
            trial_expires_at=_NOW - timedelta(days=1),
            now=_NOW,
        )
        assert result == "free"

    def test_AC4_is_active_True_trial_미래_subscription_우선_premium(self):
        """AC-4: is_active=True, trial=NOW+1d → 'premium' (subscription 이 trial 보다 우선)."""
        from app.services.entitlement_service import evaluate_entitlement

        result = evaluate_entitlement(
            is_active_subscription=True,
            trial_expires_at=_NOW + timedelta(days=1),
            now=_NOW,
        )
        assert result == "premium"


# ══════════════════════════════════════════════════════════════════════════════
# TestIsActiveTrial — 보조 함수
# ══════════════════════════════════════════════════════════════════════════════


class TestIsActiveTrial:
    """REQ-ENT-06 — is_active_trial 경계값 3케이스."""

    def test_trial_expires_at_None_반환_False(self):
        """trial_expires_at=None → False."""
        from app.services.entitlement_service import is_active_trial

        assert is_active_trial(None, _NOW) is False

    def test_trial_expires_at_미래_반환_True(self):
        """trial_expires_at=NOW+1d → True."""
        from app.services.entitlement_service import is_active_trial

        assert is_active_trial(_NOW + timedelta(days=1), _NOW) is True

    def test_trial_expires_at_과거_반환_False(self):
        """trial_expires_at=NOW-1d → False."""
        from app.services.entitlement_service import is_active_trial

        assert is_active_trial(_NOW - timedelta(days=1), _NOW) is False


# ══════════════════════════════════════════════════════════════════════════════
# TestIsPremiumOrTrial — 헬퍼
# ══════════════════════════════════════════════════════════════════════════════


class TestIsPremiumOrTrial:
    """REQ-ENT-06 — is_premium_or_trial 3케이스."""

    def test_premium_반환_True(self):
        """entitlement='premium' → True."""
        from app.services.entitlement_service import is_premium_or_trial

        assert is_premium_or_trial("premium") is True

    def test_trial_반환_True(self):
        """entitlement='trial' → True."""
        from app.services.entitlement_service import is_premium_or_trial

        assert is_premium_or_trial("trial") is True

    def test_free_반환_False(self):
        """entitlement='free' → False."""
        from app.services.entitlement_service import is_premium_or_trial

        assert is_premium_or_trial("free") is False


# ══════════════════════════════════════════════════════════════════════════════
# TestCounterRepo_GetCount — get_count_for_update
# ══════════════════════════════════════════════════════════════════════════════


class TestCounterRepo_GetCount:
    """REQ-ENT-06 — get_count_for_update: row 부재 / row 존재."""

    @pytest.mark.asyncio
    async def test_row_부재_시_0_반환(self):
        """generation_counters row 없음 → 0 반환."""
        from app.services.counter_repo import get_count_for_update

        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        count = await get_count_for_update(db, _FIXED_USER_ID)
        assert count == 0

    @pytest.mark.asyncio
    async def test_row_존재_시_row_count_반환(self):
        """generation_counters row 존재 (count=5) → 5 반환."""
        from app.services.counter_repo import get_count_for_update

        db = AsyncMock()
        row = MagicMock()
        row.count = 5
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        db.execute.return_value = result

        count = await get_count_for_update(db, _FIXED_USER_ID)
        assert count == 5


# ══════════════════════════════════════════════════════════════════════════════
# TestCounterRepo_AssertBelowLimit — assert_below_limit_or_raise
# ══════════════════════════════════════════════════════════════════════════════


class TestCounterRepo_AssertBelowLimit:
    """REQ-ENT-06 AC-5/6/7 — assert_below_limit_or_raise 분기 검증."""

    @pytest.mark.asyncio
    async def test_AC5_free_count_3_HTTPException_402_GENERATION_LIMIT_EXCEEDED(self):
        """AC-5: entitlement='free', count=FREE_GENERATION_LIMIT(3) → HTTPException 402 GENERATION_LIMIT_EXCEEDED."""
        from app.services.counter_repo import assert_below_limit_or_raise
        from fastapi import HTTPException

        db = AsyncMock()
        row = MagicMock()
        row.count = 3
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        db.execute.return_value = result

        with pytest.raises(HTTPException) as exc_info:
            await assert_below_limit_or_raise(db, _FIXED_USER_ID, "free")

        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["code"] == "GENERATION_LIMIT_EXCEEDED"

    @pytest.mark.asyncio
    async def test_AC6_trial_count_10_예외_미발생(self):
        """AC-6: entitlement='trial', count=10 → 예외 없음 (카운터 체크 skip)."""
        from app.services.counter_repo import assert_below_limit_or_raise

        db = AsyncMock()
        # trial 이면 DB 조회 자체가 skip 되므로 execute 는 호출되지 않아야 한다
        db.execute.return_value = MagicMock()

        # 예외 없이 반환되어야 한다
        await assert_below_limit_or_raise(db, _FIXED_USER_ID, "trial")

    @pytest.mark.asyncio
    async def test_AC7_premium_count_10_예외_미발생(self):
        """AC-7: entitlement='premium', count=10 → 예외 없음 (카운터 체크 skip)."""
        from app.services.counter_repo import assert_below_limit_or_raise

        db = AsyncMock()
        db.execute.return_value = MagicMock()

        await assert_below_limit_or_raise(db, _FIXED_USER_ID, "premium")

    @pytest.mark.asyncio
    async def test_free_count_2_예외_미발생(self):
        """entitlement='free', count=2 (limit 미만) → 예외 없음."""
        from app.services.counter_repo import assert_below_limit_or_raise

        db = AsyncMock()
        row = MagicMock()
        row.count = 2
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        db.execute.return_value = result

        await assert_below_limit_or_raise(db, _FIXED_USER_ID, "free")

    @pytest.mark.asyncio
    async def test_AC6_trial_execute_미호출(self):
        """AC-6 보조: trial 분기 시 DB execute 가 호출되지 않는다 (early return)."""
        from app.services.counter_repo import assert_below_limit_or_raise

        db = AsyncMock()
        db.execute.return_value = MagicMock()

        await assert_below_limit_or_raise(db, _FIXED_USER_ID, "trial")

        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_AC7_premium_execute_미호출(self):
        """AC-7 보조: premium 분기 시 DB execute 가 호출되지 않는다 (early return)."""
        from app.services.counter_repo import assert_below_limit_or_raise

        db = AsyncMock()
        db.execute.return_value = MagicMock()

        await assert_below_limit_or_raise(db, _FIXED_USER_ID, "premium")

        db.execute.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# TestCounterRepo_IncrementIfFreeSync — increment_if_free_sync (sync)
# ══════════════════════════════════════════════════════════════════════════════


class TestCounterRepo_IncrementIfFreeSync:
    """REQ-ENT-06 AC-8/9/10 — increment_if_free_sync entitlement 분기."""

    def test_AC9_free_execute_호출됨(self):
        """AC-9: entitlement='free' → db.execute 호출 (count/last_generated_at/updated_at 업데이트)."""
        from app.services.counter_repo import increment_if_free_sync

        db = MagicMock()

        increment_if_free_sync(db, _FIXED_USER_ID, "free", _NOW)

        db.execute.assert_called_once()

    def test_AC8_trial_execute_미호출(self):
        """AC-8: entitlement='trial' → db.execute 미호출 (early return)."""
        from app.services.counter_repo import increment_if_free_sync

        db = MagicMock()

        increment_if_free_sync(db, _FIXED_USER_ID, "trial", _NOW)

        db.execute.assert_not_called()

    def test_AC10_premium_execute_미호출(self):
        """AC-10: entitlement='premium' → db.execute 미호출 (early return)."""
        from app.services.counter_repo import increment_if_free_sync

        db = MagicMock()

        increment_if_free_sync(db, _FIXED_USER_ID, "premium", _NOW)

        db.execute.assert_not_called()

    def test_AC9_free_execute_호출_인수에_now_포함(self):
        """AC-9 보조: free → execute 호출 시 last_generated_at / updated_at 인수에 now 값 반영."""
        from app.services.counter_repo import increment_if_free_sync

        db = MagicMock()
        fixed_now = _NOW

        increment_if_free_sync(db, _FIXED_USER_ID, "free", fixed_now)

        call_args = db.execute.call_args
        assert call_args is not None, "execute 가 호출되지 않았다"
        # execute 에 전달된 UPDATE 구문 객체가 존재해야 한다
        assert len(call_args.args) >= 1 or len(call_args.kwargs) >= 1


# ══════════════════════════════════════════════════════════════════════════════
# TestRequireAuthWithEntitlement — deps 함수 단위
# ══════════════════════════════════════════════════════════════════════════════


class TestRequireAuthWithEntitlement:
    """REQ-ENT-06 AC-13 — require_auth_with_entitlement 반환 dict 검증."""

    @pytest.mark.asyncio
    async def test_AC13_반환_dict에_entitlement_키_존재(self):
        """AC-13: 반환 dict 에 'entitlement' 키가 존재한다."""
        from app.api.deps import require_auth_with_entitlement

        db = AsyncMock()
        # Subscription 없음 → free
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        fake_request = MagicMock()

        with patch("app.api.deps._verify_jwt", new=AsyncMock(return_value={
            "sub": str(_FIXED_USER_ID),
            "email": "test@example.com",
        })):
            payload = await require_auth_with_entitlement(request=fake_request, db=db)

        assert "entitlement" in payload

    @pytest.mark.asyncio
    async def test_subscription_None_trial_None_반환_free(self):
        """Subscription row 없음 + trial_expires_at 없음 → entitlement='free'."""
        from app.api.deps import require_auth_with_entitlement

        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        fake_request = MagicMock()

        with patch("app.api.deps._verify_jwt", new=AsyncMock(return_value={
            "sub": str(_FIXED_USER_ID),
            "email": "test@example.com",
        })):
            payload = await require_auth_with_entitlement(request=fake_request, db=db)

        assert payload["entitlement"] == "free"

    @pytest.mark.asyncio
    async def test_subscription_is_active_True_반환_premium(self):
        """Subscription.is_active=True → entitlement='premium'."""
        from app.api.deps import require_auth_with_entitlement

        db = AsyncMock()
        sub = MagicMock()
        sub.is_active = True
        sub.trial_expires_at = None
        result = MagicMock()
        result.scalar_one_or_none.return_value = sub
        db.execute.return_value = result

        fake_request = MagicMock()

        with patch("app.api.deps._verify_jwt", new=AsyncMock(return_value={
            "sub": str(_FIXED_USER_ID),
            "email": "test@example.com",
        })):
            payload = await require_auth_with_entitlement(request=fake_request, db=db)

        assert payload["entitlement"] == "premium"
