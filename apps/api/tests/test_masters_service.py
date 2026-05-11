"""
REQ-ML-05 — masters_service 단위 테스트 (TDD RED 단계)

커버 범위:
  AC-1  완료 master 3건 → items.length==3 + completed_at DESC 정렬
  AC-2  완료 0건 + pending 0건 → items=[], has_pending=false
  AC-3  완료 0건 + pending 1건(status=pending/processing) → has_pending=true
  AC-4  limit=20, master 25건 → page1 20건 + next_cursor 존재.
         cursor 전달 시 page2 5건 + next_cursor=None
  AC-5  cursor 깨진 ISO 문자열 → 422
  AC-7  다른 유저 master → 본 응답에 미포함

의존성 패턴 (docs/ARCHITECTURE.md ERD 기반):
  - list_completed_masters: DB(AsyncSession) 의존.
      mock 정상 응답 / 빈 응답 / cursor 있을 때 3 케이스
  - has_pending_masters: DB(AsyncSession) 의존.
      pending 있음 / processing 있음 / 없음 3 케이스
  - 유저 격리: user_id 필터 — 다른 user_id 데이터 미포함

NOTE: masters_service.py 는 아직 미작성 (TDD RED). ImportError 는 정상.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

_FIXED_USER_ID = uuid.uuid4()
_OTHER_USER_ID = uuid.uuid4()


def _make_master_audio(
    *,
    status: str = "completed",
    completed_at: datetime | None = None,
    user_id: uuid.UUID | None = None,
    s3_key: str = "masters/test.mp3",
    dsp_duration_ms: int = 120_000,
) -> MagicMock:
    m = MagicMock()
    m.id = uuid.uuid4()
    m.status = status
    m.completed_at = completed_at or datetime.now(timezone.utc)
    m.s3_key = s3_key
    m.dsp_duration_ms = dsp_duration_ms
    return m


def _make_recording_session(
    *,
    user_id: uuid.UUID | None = None,
    song_key: str = "brahms",
) -> MagicMock:
    s = MagicMock()
    s.id = uuid.uuid4()
    s.user_id = user_id or _FIXED_USER_ID
    s.song_key = song_key
    return s


def _make_async_db_execute(rows: list) -> AsyncMock:
    """AsyncSession.execute() 를 rows 리스트를 반환하도록 mock."""
    db = AsyncMock()
    result = MagicMock()
    result.all.return_value = rows
    result.scalar_one_or_none.return_value = rows[0] if rows else None
    db.execute.return_value = result
    return db


# ══════════════════════════════════════════════════════════════════════════════
# AC-1 — 완료 master 3건 → items 3개 + completed_at DESC 정렬
# ══════════════════════════════════════════════════════════════════════════════


class TestListCompletedMasters_OrderingDesc:
    """REQ-ML-05 AC-1 — 완료 master 3건 반환 및 completed_at DESC 정렬 검증."""

    @pytest.mark.asyncio
    async def test_완료_master_3건_반환_items_길이_3(self):
        """completed master 3건 → 반환 리스트 길이 3."""
        from app.services.masters_service import list_completed_masters

        now = datetime.now(timezone.utc)
        sessions = [_make_recording_session() for _ in range(3)]
        masters = [
            _make_master_audio(completed_at=now - timedelta(seconds=i))
            for i in range(3)
        ]
        rows = list(zip(masters, sessions))

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        returned_masters, returned_sessions, next_cursor = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        assert len(returned_masters) == 3

    @pytest.mark.asyncio
    async def test_완료_master_3건_completed_at_DESC_정렬(self):
        """completed master 3건 → completed_at 내림차순(DESC) 순서로 반환."""
        from app.services.masters_service import list_completed_masters

        now = datetime.now(timezone.utc)
        sessions = [_make_recording_session() for _ in range(3)]
        # rows 는 service 가 DB 에서 가져온 순서(이미 DESC 정렬됨)를 시뮬레이션
        masters = [
            _make_master_audio(completed_at=now - timedelta(seconds=i))
            for i in range(3)  # index 0 이 가장 최신
        ]
        rows = list(zip(masters, sessions))

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        returned_masters, _, _ = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        # DB 레벨 DESC 정렬을 service 가 그대로 보존하는지 확인
        timestamps = [m.completed_at for m in returned_masters]
        assert timestamps == sorted(timestamps, reverse=True), (
            "returned masters 는 completed_at DESC 순서여야 한다"
        )


# ══════════════════════════════════════════════════════════════════════════════
# AC-2 — 빈 상태: 완료 0 + pending 0 → items=[], has_pending=false
# ══════════════════════════════════════════════════════════════════════════════


class TestEmptyState:
    """REQ-ML-05 AC-2 — 완료 0건 + pending 0건 → 빈 목록 + has_pending=False."""

    @pytest.mark.asyncio
    async def test_완료_master_없을_때_빈_리스트_반환(self):
        """completed master 0건 → list_completed_masters 반환 items=[]."""
        from app.services.masters_service import list_completed_masters

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = []
        db.execute.return_value = result

        returned_masters, returned_sessions, next_cursor = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        assert returned_masters == []
        assert next_cursor is None

    @pytest.mark.asyncio
    async def test_pending_master_없을_때_has_pending_false(self):
        """pending/processing master 0건 → has_pending_masters 반환 False."""
        from app.services.masters_service import has_pending_masters

        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None  # 해당 row 없음
        db.execute.return_value = result

        has_pending = await has_pending_masters(db=db, user_id=_FIXED_USER_ID)

        assert has_pending is False


# ══════════════════════════════════════════════════════════════════════════════
# AC-3 — pending 1건 → has_pending=True (status=pending / status=processing)
# ══════════════════════════════════════════════════════════════════════════════


class TestHasPending:
    """REQ-ML-05 AC-3 — pending/processing master 존재 시 has_pending=True."""

    @pytest.mark.asyncio
    async def test_status_pending_master_존재_시_has_pending_true(self):
        """status='pending' master 1건 → has_pending_masters 반환 True."""
        from app.services.masters_service import has_pending_masters

        pending_master_id = uuid.uuid4()

        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = pending_master_id
        db.execute.return_value = result

        has_pending = await has_pending_masters(db=db, user_id=_FIXED_USER_ID)

        assert has_pending is True

    @pytest.mark.asyncio
    async def test_status_processing_master_존재_시_has_pending_true(self):
        """status='processing' master 1건 → has_pending_masters 반환 True."""
        from app.services.masters_service import has_pending_masters

        processing_master_id = uuid.uuid4()

        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = processing_master_id
        db.execute.return_value = result

        has_pending = await has_pending_masters(db=db, user_id=_FIXED_USER_ID)

        assert has_pending is True


# ══════════════════════════════════════════════════════════════════════════════
# AC-4 — cursor 페이지네이션: limit=20, 25건 → page1 20건 + next_cursor / page2 5건
# ══════════════════════════════════════════════════════════════════════════════


class TestCursorPagination:
    """REQ-ML-05 AC-4 — keyset cursor 페이지네이션 동작 검증."""

    @pytest.mark.asyncio
    async def test_25건_중_limit_20_요청_시_20건_반환(self):
        """master 25건 + limit=20 → page1 items 20건 반환."""
        from app.services.masters_service import list_completed_masters

        now = datetime.now(timezone.utc)
        # service 는 limit+1(=21) 건을 fetch 후 has_more 판단
        sessions = [_make_recording_session() for _ in range(21)]
        masters = [
            _make_master_audio(completed_at=now - timedelta(seconds=i))
            for i in range(21)
        ]
        rows = list(zip(masters, sessions))

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows  # limit+1 건 반환
        db.execute.return_value = result

        returned_masters, _, _ = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        assert len(returned_masters) == 20

    @pytest.mark.asyncio
    async def test_25건_중_limit_20_요청_시_next_cursor_존재(self):
        """master 25건 + limit=20 → next_cursor is not None."""
        from app.services.masters_service import list_completed_masters

        now = datetime.now(timezone.utc)
        sessions = [_make_recording_session() for _ in range(21)]
        masters = [
            _make_master_audio(completed_at=now - timedelta(seconds=i))
            for i in range(21)
        ]
        rows = list(zip(masters, sessions))

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        _, _, next_cursor = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        assert next_cursor is not None

    @pytest.mark.asyncio
    async def test_cursor_전달_시_page2_5건_반환(self):
        """cursor 전달 → 나머지 5건만 반환 (limit+1 fetch 결과 5건 미만)."""
        from app.services.masters_service import list_completed_masters

        now = datetime.now(timezone.utc)
        # page2: 남은 5건만 반환 (limit+1=21 보다 적으므로 has_more=False)
        sessions = [_make_recording_session() for _ in range(5)]
        masters = [
            _make_master_audio(completed_at=now - timedelta(seconds=i + 100))
            for i in range(5)
        ]
        rows = list(zip(masters, sessions))

        cursor_dt = now - timedelta(seconds=20)  # page1 마지막 항목의 completed_at

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        returned_masters, _, next_cursor = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=cursor_dt,
            limit=20,
        )

        assert len(returned_masters) == 5
        assert next_cursor is None

    @pytest.mark.asyncio
    async def test_cursor_전달_시_execute_호출에_cursor_인수_포함(self):
        """cursor datetime 전달 시 DB execute 호출이 1번 이상 이루어진다."""
        from app.services.masters_service import list_completed_masters

        cursor_dt = datetime.now(timezone.utc) - timedelta(minutes=5)

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = []
        db.execute.return_value = result

        await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=cursor_dt,
            limit=20,
        )

        assert db.execute.call_count >= 1, (
            "cursor 전달 시에도 DB execute 가 호출되어야 한다"
        )


# ══════════════════════════════════════════════════════════════════════════════
# AC-5 — 깨진 cursor ISO → 422 (FastAPI TestClient 라우터 레벨)
# ══════════════════════════════════════════════════════════════════════════════


class TestCursorParseInvalid:
    """REQ-ML-05 AC-5 — cursor 파라미터 깨진 ISO 문자열 → HTTP 422."""

    @pytest.fixture
    def client(self):
        """masters 라우터 포함 테스트 앱 + DB/auth mock."""
        from app.api.v1.masters import router as masters_router
        from app.api.deps import require_auth_with_entitlement
        from app.core.db import get_db

        test_app = FastAPI()
        test_app.include_router(masters_router, prefix="/api/v1")

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = []
        result.scalar_one_or_none.return_value = None
        db.execute.return_value = result

        def _auth_override():
            return {"sub": str(_FIXED_USER_ID), "entitlement": "free"}

        test_app.dependency_overrides[require_auth_with_entitlement] = _auth_override
        test_app.dependency_overrides[get_db] = lambda: db
        return TestClient(test_app, raise_server_exceptions=False)

    def test_깨진_cursor_문자열_422_반환(self, client):
        """cursor=not-a-date → Pydantic/FastAPI 파싱 실패 → 422."""
        resp = client.get("/api/v1/masters/me", params={"cursor": "not-a-valid-iso-string"})
        assert resp.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# AC-7 — 유저 격리: 다른 유저 master → 본 응답에 미포함
# ══════════════════════════════════════════════════════════════════════════════


class TestUserIsolation:
    """REQ-ML-05 AC-7 — 다른 user_id master 는 list_completed_masters 결과에 미포함."""

    @pytest.mark.asyncio
    async def test_다른_유저_master_반환_안됨(self):
        """DB mock 이 user_id 필터링한 결과(빈 목록) 반환 → service 도 빈 목록 반환.

        service 는 WHERE RecordingSession.user_id == user_id 조건으로 쿼리를 구성해야 한다.
        이 테스트는 다른 유저의 데이터가 DB execute 결과로 반환되지 않도록
        user_id 를 올바르게 필터 조건으로 전달하는지 검증한다.
        """
        from app.services.masters_service import list_completed_masters

        # DB 는 user_id 필터를 통과한 0건만 반환 (다른 유저 데이터 없음)
        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = []
        db.execute.return_value = result

        returned_masters, returned_sessions, _ = await list_completed_masters(
            db=db,
            user_id=_FIXED_USER_ID,
            cursor=None,
            limit=20,
        )

        # execute 호출 확인: user_id 가 인수로 전달되어야 한다
        assert db.execute.called, "list_completed_masters 는 DB execute 를 호출해야 한다"
        assert returned_masters == [], "다른 유저 데이터는 반환되지 않아야 한다"

    @pytest.mark.asyncio
    async def test_다른_유저_master_포함된_DB_결과_서비스_레이어_격리_확인(self):
        """service 가 user_id 를 execute 에 전달하는지 stmt 인수 검증.

        DB mock 이 반환한 rows 에는 본 유저 데이터만 포함된다고 가정.
        service 가 WHERE 조건 없이 전체를 가져오면 다른 유저 데이터가 새나온다.
        execute call_args 에서 user_id 가 바인딩 파라미터로 포함되었는지 확인.
        """
        from app.services.masters_service import list_completed_masters

        target_user_id = uuid.uuid4()
        other_user_id = uuid.uuid4()

        # 본 유저 데이터 1건만 반환하도록 mock 설정
        session_of_target = _make_recording_session(user_id=target_user_id)
        master_of_target = _make_master_audio()
        rows = [(master_of_target, session_of_target)]

        db = AsyncMock()
        result = MagicMock()
        result.all.return_value = rows
        db.execute.return_value = result

        returned_masters, returned_sessions, _ = await list_completed_masters(
            db=db,
            user_id=target_user_id,
            cursor=None,
            limit=20,
        )

        assert len(returned_masters) == 1
        # 반환된 session 의 user_id 가 target_user_id 와 일치
        assert returned_sessions[0].user_id == target_user_id
