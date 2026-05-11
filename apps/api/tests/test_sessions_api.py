"""
impl/03 — 세션 API 라우터 단위 테스트 (TDD RED 단계)

커버 범위:
  POST /api/v1/sessions/init
    AC-SI-01  JWT 없음 → 401
    AC-SI-02  무료 유저 count=3 → 402 GENERATION_LIMIT_EXCEEDED
    AC-SI-03  정상 요청 → 201 + session_id + presigned_upload_url + s3_key + is_new:true
    AC-SI-04  동일 idempotency_key 재요청 → 201 + is_new:false + 기존 session_id

  POST /api/v1/sessions/{id}/recordings
    AC-SR-01  정상 요청 → 201 + recording_id
    AC-SR-02  다른 유저의 session_id → 404

  POST /api/v1/sessions/{id}/generate
    AC-SG-01  정상 요청 → 202 + Celery task .delay 호출 확인
    AC-SG-02  master.status='processing' 재요청 → 200 (중복 dispatch 없음)

  GET /api/v1/sessions/{id}/status
    AC-SS-01  processing 상태 → master_status:'processing', presigned_url:null
    AC-SS-02  completed 상태 → master_status:'completed', presigned_url 포함
    AC-SS-03  다른 유저 session → 404

  GET /api/v1/masters/me
    AC-MG-01  완료 음원 있음 → items 목록 + presigned_url 포함
    AC-MG-02  생성 중 세션 있음 → has_pending:true
    AC-MG-03  완료 음원 없음 → items:[], has_pending:false

  GET|POST /api/v1/generations/*
    AC-GD-01  모든 경로 → 410 Gone

의존성 패턴 (docs/ARCHITECTURE.md 기반):
  - sessions.py: DB(AsyncSession) + require_auth_with_entitlement + storage_service + dsp_process_task.delay
  - session_service.init_session: GenerationCounter(SELECT FOR UPDATE) + RecordingSession + MasterAudio + storage_service
  - masters.py: DB + require_auth_with_entitlement + storage_service
  - 의존 mock 정상 응답 / 의존 mock 실패 / 의존 없을 때(다른 유저 세션) 3 케이스 포함
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth_with_entitlement
from app.core.db import get_db


# ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

_FIXED_USER_ID = str(uuid.uuid4())
_OTHER_USER_ID = str(uuid.uuid4())
_FIXED_SESSION_ID = str(uuid.uuid4())
_FIXED_IDEMPOTENCY_KEY = str(uuid.uuid4())
_FIXED_MASTER_ID = str(uuid.uuid4())
_FIXED_RECORDING_ID = str(uuid.uuid4())


def _auth_override(entitlement: str = "free", user_id: str = _FIXED_USER_ID):
    """require_auth_with_entitlement 의존성 오버라이드 빌더."""
    def _override():
        return {"sub": user_id, "entitlement": entitlement}
    return _override


def _mock_db() -> AsyncMock:
    db = AsyncMock(spec=AsyncSession)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    return db


def _make_execute_result(scalar_value=None, all_value=None):
    """AsyncSession.execute() 반환값 mock 헬퍼."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar_value
    if all_value is not None:
        scalars_mock = MagicMock()
        scalars_mock.all.return_value = all_value
        result.scalars.return_value = scalars_mock
    return result


def _build_app() -> FastAPI:
    """세션/마스터/generations 라우터를 포함한 테스트용 앱 생성."""
    from app.api.v1.sessions import router as sessions_router
    from app.api.v1.masters import router as masters_router
    from app.api.v1.generations import router as generations_router

    test_app = FastAPI()
    test_app.include_router(sessions_router, prefix="/api/v1")
    test_app.include_router(masters_router, prefix="/api/v1")
    test_app.include_router(generations_router, prefix="/api/v1")
    return test_app


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/v1/sessions/init
# ══════════════════════════════════════════════════════════════════════════════


class TestSessionInit_AC_SI_01_인증없음_401:
    """AC-SI-01 — JWT 없음 → 401 Unauthorized."""

    @pytest.mark.asyncio
    async def test_토큰_없이_세션_init_요청_시_401_반환(self):
        """require_auth_with_entitlement이 Authorization 헤더 없는 Request 시 401 raise."""
        from fastapi import HTTPException

        fake_request = MagicMock()
        fake_request.headers.get.return_value = ""
        db = _mock_db()

        with pytest.raises(HTTPException) as exc_info:
            await require_auth_with_entitlement(request=fake_request, db=db)

        assert exc_info.value.status_code == 401


class TestSessionInit_AC_SI_02_무료유저_한도초과_402:
    """AC-SI-02 — 무료 유저 count=3 → 402 GENERATION_LIMIT_EXCEEDED."""

    @pytest.fixture
    def client(self):
        app = _build_app()
        db = _mock_db()

        # GenerationCounter: count=3 (한도 도달)
        counter = MagicMock()
        counter.count = 3
        db.execute.return_value = _make_execute_result(scalar_value=counter)

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_무료유저_count_3_이면_402_반환(self, client):
        """AC-SI-02: count >= 3 → HTTP 402."""
        resp = client.post(
            "/api/v1/sessions/init",
            json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
        )

        assert resp.status_code == 402

    def test_무료유저_한도초과_응답에_GENERATION_LIMIT_EXCEEDED_코드_포함(self, client):
        """AC-SI-02: 에러 응답 detail.code == 'GENERATION_LIMIT_EXCEEDED'."""
        resp = client.post(
            "/api/v1/sessions/init",
            json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
        )

        assert resp.json()["detail"]["code"] == "GENERATION_LIMIT_EXCEEDED"


class TestSessionInit_AC_SI_03_정상요청_201:
    """AC-SI-03 — 정상 요청 → 201 + session_id + presigned_upload_url + s3_key + is_new:true."""

    @pytest.fixture
    def client_and_db(self):
        """각 테스트에서 fixture로 주입받아 사용."""
        app = _build_app()
        db = _mock_db()

        def execute_side_effect(stmt, *args, **kwargs):
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side_effect
        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app, raise_server_exceptions=False), db

    def test_신규_세션_201_반환(self, client_and_db):
        """AC-SI-03: 정상 무료 유저 요청 → 201."""
        client, db = client_and_db
        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.example.com/presigned-put"):
            resp = client.post(
                "/api/v1/sessions/init",
                json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
            )

        assert resp.status_code == 201

    def test_신규_세션_응답에_session_id_포함(self, client_and_db):
        """AC-SI-03: 응답 JSON에 session_id 있음."""
        client, db = client_and_db
        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.example.com/presigned-put"):
            resp = client.post(
                "/api/v1/sessions/init",
                json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
            )

        data = resp.json()
        assert "session_id" in data

    def test_신규_세션_응답에_presigned_upload_url_포함(self, client_and_db):
        """AC-SI-03: 응답 JSON에 presigned_upload_url 있음."""
        client, db = client_and_db
        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.example.com/presigned-put"):
            resp = client.post(
                "/api/v1/sessions/init",
                json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
            )

        data = resp.json()
        assert "presigned_upload_url" in data
        assert data["presigned_upload_url"] == "https://s3.example.com/presigned-put"

    def test_신규_세션_응답에_s3_key_포함(self, client_and_db):
        """AC-SI-03: 응답 JSON에 s3_key 있음."""
        client, db = client_and_db
        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.example.com/presigned-put"):
            resp = client.post(
                "/api/v1/sessions/init",
                json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
            )

        data = resp.json()
        assert "s3_key" in data

    def test_신규_세션_응답의_is_new가_true(self, client_and_db):
        """AC-SI-03: 신규 세션 → is_new:true."""
        client, db = client_and_db
        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.example.com/presigned-put"):
            resp = client.post(
                "/api/v1/sessions/init",
                json={"idempotency_key": _FIXED_IDEMPOTENCY_KEY, "song_key": "brahms"},
            )

        assert resp.json()["is_new"] is True


class TestSessionInit_AC_SI_03_정상요청_통합:
    """AC-SI-03 — session_service.init_session을 직접 단위 테스트."""

    @pytest.mark.asyncio
    async def test_신규_세션_생성_시_is_new_true_반환(self):
        """AC-SI-03: init_session → is_new=True."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        user_id = uuid.uuid4()

        # GenerationCounter: count=0
        counter_mock = MagicMock()
        counter_mock.count = 0

        # 멱등성 체크: 기존 세션 없음
        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # GenerationCounter SELECT FOR UPDATE
                return _make_execute_result(scalar_value=counter_mock)
            else:
                # 멱등성 체크 → 없음
                return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, user_id, "free", req)

        assert result.is_new is True

    @pytest.mark.asyncio
    async def test_신규_세션_생성_시_presigned_upload_url_반환(self):
        """AC-SI-03: init_session → presigned_upload_url 포함."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        user_id = uuid.uuid4()

        counter_mock = MagicMock()
        counter_mock.count = 0

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=counter_mock)
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, user_id, "free", req)

        assert result.presigned_upload_url == "https://s3.test/put"

    @pytest.mark.asyncio
    async def test_무료유저_count_3이면_402_HTTPException(self):
        """AC-SI-02: count=3 → HTTPException(402)."""
        from fastapi import HTTPException
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        counter_mock = MagicMock()
        counter_mock.count = 3
        db.execute.return_value = _make_execute_result(scalar_value=counter_mock)

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with pytest.raises(HTTPException) as exc_info:
            await init_session(db, uuid.uuid4(), "free", req)

        assert exc_info.value.status_code == 402

    @pytest.mark.asyncio
    async def test_무료유저_count_2이면_정상_통과(self):
        """AC-SI-02 경계값: count=2 < 3 → 허용."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        counter_mock = MagicMock()
        counter_mock.count = 2

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=counter_mock)
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, uuid.uuid4(), "free", req)

        assert result.is_new is True

    @pytest.mark.asyncio
    async def test_premium_유저는_counter_체크_없이_통과(self):
        """AC-SI-02: entitlement='premium' → GenerationCounter SELECT 미발생."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()

        # premium → counter 체크 없이 바로 멱등성 체크
        db.execute.return_value = _make_execute_result(scalar_value=None)

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="mozart",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, uuid.uuid4(), "premium", req)

        assert result.is_new is True


class TestSessionInit_AC_SI_04_멱등성_is_new_false:
    """AC-SI-04 — 동일 idempotency_key 재요청 → 201 + is_new:false + 기존 session_id."""

    @pytest.mark.asyncio
    async def test_동일_idempotency_key_재요청_시_is_new_false(self):
        """AC-SI-04: 기존 세션 존재 → is_new=False."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        existing_session_id = uuid.uuid4()
        user_id = uuid.uuid4()

        existing_session = MagicMock()
        existing_session.id = existing_session_id

        counter_mock = MagicMock()
        counter_mock.count = 0

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=counter_mock)
            # 멱등성 체크 → 기존 세션 반환
            return _make_execute_result(scalar_value=existing_session)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, user_id, "free", req)

        assert result.is_new is False

    @pytest.mark.asyncio
    async def test_동일_idempotency_key_재요청_시_기존_session_id_반환(self):
        """AC-SI-04: is_new=False 시 반환 session_id == 기존 세션 id."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        existing_session_id = uuid.uuid4()

        existing_session = MagicMock()
        existing_session.id = existing_session_id

        counter_mock = MagicMock()
        counter_mock.count = 0

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=counter_mock)
            return _make_execute_result(scalar_value=existing_session)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            result = await init_session(db, uuid.uuid4(), "free", req)

        assert result.session_id == str(existing_session_id)

    @pytest.mark.asyncio
    async def test_동일_idempotency_key_재요청_시_새_session_INSERT_없음(self):
        """AC-SI-04: 기존 세션 반환 시 db.add 호출 없음 (신규 INSERT 없음)."""
        from app.services.session_service import init_session
        from app.schemas.sessions import SessionInitRequest

        db = _mock_db()
        existing_session = MagicMock()
        existing_session.id = uuid.uuid4()

        counter_mock = MagicMock()
        counter_mock.count = 0

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=counter_mock)
            return _make_execute_result(scalar_value=existing_session)

        db.execute.side_effect = execute_side

        req = SessionInitRequest(
            idempotency_key=uuid.UUID(_FIXED_IDEMPOTENCY_KEY),
            song_key="brahms",
        )

        with patch("app.services.session_service.storage_service.generate_presigned_put_url",
                   return_value="https://s3.test/put"):
            await init_session(db, uuid.uuid4(), "free", req)

        db.add.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/v1/sessions/{id}/recordings
# ══════════════════════════════════════════════════════════════════════════════


class TestRecordingRegister_AC_SR_01_정상요청_201:
    """AC-SR-01 — 정상 요청 → 201 + recording_id."""

    @pytest.fixture
    def client_and_db(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()
        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        recording_obj = MagicMock()
        recording_obj.id = uuid.UUID(_FIXED_RECORDING_ID)

        call_count = [0]

        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        # db.add 호출 시 recording.id를 확정
        def add_side(obj):
            if hasattr(obj, 'id') and obj.id is None:
                obj.id = uuid.UUID(_FIXED_RECORDING_ID)

        db.add.side_effect = add_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app), db

    def test_정상_요청_201_반환(self, client_and_db):
        """AC-SR-01: 정상 클립 등록 → 201."""
        client, _ = client_and_db
        resp = client.post(
            f"/api/v1/sessions/{_FIXED_SESSION_ID}/recordings",
            json={"s3_key": f"recordings/{_FIXED_SESSION_ID}/clip_abc.m4a", "duration_ms": 5000},
        )

        assert resp.status_code == 201

    def test_정상_요청_응답에_recording_id_포함(self, client_and_db):
        """AC-SR-01: 응답 JSON에 recording_id 있음."""
        client, _ = client_and_db
        resp = client.post(
            f"/api/v1/sessions/{_FIXED_SESSION_ID}/recordings",
            json={"s3_key": f"recordings/{_FIXED_SESSION_ID}/clip_abc.m4a", "duration_ms": 5000},
        )

        data = resp.json()
        assert "recording_id" in data


class TestRecordingRegister_AC_SR_02_다른유저_404:
    """AC-SR-02 — 다른 유저의 session_id → 404."""

    @pytest.fixture
    def client(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()
        # 다른 유저 세션 → scalar_one_or_none = None (소유자 불일치)
        db.execute.return_value = _make_execute_result(scalar_value=None)

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override(
            "free", _FIXED_USER_ID
        )
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_다른_유저_세션_접근_시_404_반환(self, client):
        """AC-SR-02: user_id 불일치 세션 → 404."""
        other_session_id = str(uuid.uuid4())
        resp = client.post(
            f"/api/v1/sessions/{other_session_id}/recordings",
            json={"s3_key": "recordings/other/clip.m4a", "duration_ms": 3000},
        )

        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# POST /api/v1/sessions/{id}/generate
# ══════════════════════════════════════════════════════════════════════════════


class TestGenerate_AC_SG_01_정상요청_202_Celery_dispatch:
    """AC-SG-01 — 정상 요청 → 202 + dsp_process_task.delay 호출."""

    @pytest.fixture
    def client_and_db(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()

        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "pending"

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            if call_count[0] == 2:
                return _make_execute_result(scalar_value=master_obj)
            # UPDATE RecordingSession status='generating'
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app), db

    def test_정상_generate_요청_202_반환(self, client_and_db):
        """AC-SG-01: 정상 generate → 202."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            resp = client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")

        assert resp.status_code == 202

    def test_정상_generate_요청_시_celery_delay_호출됨(self, client_and_db):
        """AC-SG-01: 202 응답 + dsp_process_task.delay 1회 호출."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")
            mock_task.delay.assert_called_once()

    def test_generate_celery_delay_호출_시_session_id_전달됨(self, client_and_db):
        """AC-SG-01: .delay 호출 인수에 session_id 포함."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")

        call_kwargs = mock_task.delay.call_args.kwargs
        assert call_kwargs.get("session_id") == _FIXED_SESSION_ID

    def test_generate_celery_delay_호출_시_master_audio_id_전달됨(self, client_and_db):
        """AC-SG-01: .delay 호출 인수에 master_audio_id 포함."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")

        call_kwargs = mock_task.delay.call_args.kwargs
        assert call_kwargs.get("master_audio_id") == _FIXED_MASTER_ID


class TestGenerate_AC_SG_02_이미_처리중_중복dispatch_없음:
    """AC-SG-02 — master.status='processing' 재요청 → 200 (중복 dispatch 없음)."""

    @pytest.fixture
    def client_and_db(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()

        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "processing"  # 이미 처리 중

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            return _make_execute_result(scalar_value=master_obj)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app), db

    def test_processing_상태_재요청_200_반환(self, client_and_db):
        """AC-SG-02: master.status='processing' → 200 (중복 dispatch 없음)."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            resp = client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")

        assert resp.status_code == 200

    def test_processing_상태_재요청_시_celery_delay_미호출(self, client_and_db):
        """AC-SG-02: 중복 dispatch 방지 — .delay 호출 없음."""
        client, _ = client_and_db

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")
            mock_task.delay.assert_not_called()

    def test_completed_상태_재요청_시_celery_delay_미호출(self, client_and_db):
        """AC-SG-02: master.status='completed' 도 중복 dispatch 방지."""
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()
        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "completed"

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            return _make_execute_result(scalar_value=master_obj)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)

        with patch("app.api.v1.sessions.dsp_process_task") as mock_task:
            mock_task.delay = MagicMock()
            client.post(f"/api/v1/sessions/{_FIXED_SESSION_ID}/generate")
            mock_task.delay.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/sessions/{id}/status
# ══════════════════════════════════════════════════════════════════════════════


class TestSessionStatus_AC_SS_01_processing:
    """AC-SS-01 — processing → master_status:'processing', presigned_url:null."""

    @pytest.fixture
    def client(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()

        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.status = "generating"
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "processing"
        master_obj.s3_key = None
        master_obj.error_message = None

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            return _make_execute_result(scalar_value=master_obj)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_processing_상태_master_status_값이_processing(self, client):
        """AC-SS-01: master_status == 'processing'."""
        resp = client.get(f"/api/v1/sessions/{_FIXED_SESSION_ID}/status")

        assert resp.json()["master_status"] == "processing"

    def test_processing_상태_presigned_url이_null(self, client):
        """AC-SS-01: presigned_url == null (미완료 시 URL 없음)."""
        resp = client.get(f"/api/v1/sessions/{_FIXED_SESSION_ID}/status")

        assert resp.json()["presigned_url"] is None


class TestSessionStatus_AC_SS_02_completed:
    """AC-SS-02 — completed → master_status:'completed', presigned_url 포함."""

    @pytest.fixture
    def client(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()

        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.status = "completed"
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "completed"
        master_obj.s3_key = "tracks/user/master.mp3"
        master_obj.error_message = None

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_execute_result(scalar_value=session_obj)
            return _make_execute_result(scalar_value=master_obj)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_completed_상태_master_status_값이_completed(self, client):
        """AC-SS-02: master_status == 'completed'."""
        with patch("app.api.v1.sessions.storage_service.generate_presigned_url",
                   return_value="https://s3.example.com/master.mp3"):
            resp = client.get(f"/api/v1/sessions/{_FIXED_SESSION_ID}/status")

        assert resp.json()["master_status"] == "completed"

    def test_completed_상태_presigned_url이_포함됨(self, client):
        """AC-SS-02: presigned_url != null (완료 시 URL 제공)."""
        with patch("app.api.v1.sessions.storage_service.generate_presigned_url",
                   return_value="https://s3.example.com/master.mp3"):
            resp = client.get(f"/api/v1/sessions/{_FIXED_SESSION_ID}/status")

        assert resp.json()["presigned_url"] == "https://s3.example.com/master.mp3"


class TestSessionStatus_AC_SS_03_다른유저_404:
    """AC-SS-03 — 다른 유저 session → 404."""

    @pytest.fixture
    def client(self):
        from app.api.v1.sessions import router as sessions_router

        app = FastAPI()
        app.include_router(sessions_router, prefix="/api/v1")

        db = _mock_db()
        db.execute.return_value = _make_execute_result(scalar_value=None)

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override(
            "free", _FIXED_USER_ID
        )
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_다른_유저_세션_상태_조회_시_404(self, client):
        """AC-SS-03: user_id 불일치 세션 status 조회 → 404."""
        other_session = str(uuid.uuid4())
        resp = client.get(f"/api/v1/sessions/{other_session}/status")

        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/masters/me
# ══════════════════════════════════════════════════════════════════════════════


class TestMastersMe_AC_MG_01_완료음원목록:
    """AC-MG-01 — 완료 음원 있음 → items 목록 + presigned_url 포함."""

    @pytest.fixture
    def client(self):
        from app.api.v1.masters import router as masters_router

        app = FastAPI()
        app.include_router(masters_router, prefix="/api/v1")

        db = _mock_db()

        # 완료된 master + session join row
        master_obj = MagicMock()
        master_obj.id = uuid.UUID(_FIXED_MASTER_ID)
        master_obj.status = "completed"
        master_obj.s3_key = "tracks/user/master.mp3"
        master_obj.completed_at = datetime.now(timezone.utc)
        master_obj.dsp_duration_ms = 600000

        session_obj = MagicMock()
        session_obj.id = uuid.UUID(_FIXED_SESSION_ID)
        session_obj.song_key = "brahms"
        session_obj.user_id = uuid.UUID(_FIXED_USER_ID)

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # 완료 목록
                result = MagicMock()
                result.all.return_value = [(master_obj, session_obj)]
                return result
            # pending 체크 → None (pending 없음)
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_완료_음원_있음_items_목록_반환(self, client):
        """AC-MG-01: items 리스트에 1개 항목 포함."""
        with patch("app.api.v1.masters.storage_service.generate_presigned_url",
                   return_value="https://s3.example.com/master.mp3"):
            resp = client.get("/api/v1/masters/me")

        data = resp.json()
        assert len(data["items"]) == 1

    def test_완료_음원_항목에_presigned_url_포함(self, client):
        """AC-MG-01: items[0].presigned_url != null."""
        with patch("app.api.v1.masters.storage_service.generate_presigned_url",
                   return_value="https://s3.example.com/master.mp3"):
            resp = client.get("/api/v1/masters/me")

        item = resp.json()["items"][0]
        assert item["presigned_url"] == "https://s3.example.com/master.mp3"

    def test_완료_음원_항목에_song_key_포함(self, client):
        """AC-MG-01: items[0].song_key 존재."""
        with patch("app.api.v1.masters.storage_service.generate_presigned_url",
                   return_value="https://s3.example.com/master.mp3"):
            resp = client.get("/api/v1/masters/me")

        item = resp.json()["items"][0]
        assert item["song_key"] == "brahms"


class TestMastersMe_AC_MG_02_생성중_has_pending_true:
    """AC-MG-02 — 생성 중 세션 있음 → has_pending:true."""

    @pytest.fixture
    def client(self):
        from app.api.v1.masters import router as masters_router

        app = FastAPI()
        app.include_router(masters_router, prefix="/api/v1")

        db = _mock_db()

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                # 완료 목록 → 빈 목록
                result = MagicMock()
                result.all.return_value = []
                return result
            # pending 체크 → pending master id 반환
            return _make_execute_result(scalar_value=uuid.UUID(_FIXED_MASTER_ID))

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_생성_중_세션_있을_때_has_pending_true(self, client):
        """AC-MG-02: has_pending == true."""
        resp = client.get("/api/v1/masters/me")

        assert resp.json()["has_pending"] is True


class TestMastersMe_AC_MG_03_완료음원없음:
    """AC-MG-03 — 완료 음원 없음 → items:[], has_pending:false."""

    @pytest.fixture
    def client(self):
        from app.api.v1.masters import router as masters_router

        app = FastAPI()
        app.include_router(masters_router, prefix="/api/v1")

        db = _mock_db()

        call_count = [0]
        def execute_side(stmt, *args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                result = MagicMock()
                result.all.return_value = []
                return result
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        app.dependency_overrides[require_auth_with_entitlement] = _auth_override("free")
        app.dependency_overrides[get_db] = lambda: db
        return TestClient(app)

    def test_완료_음원_없음_items_빈_배열(self, client):
        """AC-MG-03: items == []."""
        resp = client.get("/api/v1/masters/me")

        assert resp.json()["items"] == []

    def test_완료_음원_없음_has_pending_false(self, client):
        """AC-MG-03: has_pending == false."""
        resp = client.get("/api/v1/masters/me")

        assert resp.json()["has_pending"] is False


class TestMastersMe_본인_음원만_반환:
    """GET /masters/me — 다른 user의 master는 포함되지 않음 (권한 경계)."""

    @pytest.mark.asyncio
    async def test_본인_user_id로만_조회됨(self):
        """masters/me는 WHERE user_id == auth.sub 조건으로 조회해야 한다."""
        from app.api.v1.masters import get_my_masters

        db = _mock_db()
        user_id = uuid.UUID(_FIXED_USER_ID)

        execute_calls = []
        def execute_side(stmt, *args, **kwargs):
            execute_calls.append(stmt)
            if len(execute_calls) == 1:
                result = MagicMock()
                result.all.return_value = []
                return result
            return _make_execute_result(scalar_value=None)

        db.execute.side_effect = execute_side

        with patch("app.api.v1.masters.storage_service.generate_presigned_url",
                   return_value="https://s3.test/m.mp3"):
            await get_my_masters(
                cursor=None,
                limit=20,
                auth={"sub": str(user_id), "entitlement": "free"},
                db=db,
            )

        # execute가 2회 호출되어야 함 (completed 목록 + pending 체크)
        assert len(execute_calls) == 2


# ══════════════════════════════════════════════════════════════════════════════
# GET|POST /api/v1/generations/* → 410 Gone
# ══════════════════════════════════════════════════════════════════════════════


class TestGenerations_AC_GD_01_410Gone:
    """AC-GD-01 — 모든 /generations/* 경로 → 410 Gone."""

    @pytest.fixture
    def client(self):
        from app.api.v1.generations import router as generations_router

        app = FastAPI()
        app.include_router(generations_router, prefix="/api/v1")
        return TestClient(app)

    def test_GET_임의_경로_410_반환(self, client):
        """AC-GD-01: GET /api/v1/generations/any → 410."""
        resp = client.get("/api/v1/generations/any-path")

        assert resp.status_code == 410

    def test_POST_임의_경로_410_반환(self, client):
        """AC-GD-01: POST /api/v1/generations/any → 410."""
        resp = client.post("/api/v1/generations/any-path", json={})

        assert resp.status_code == 410

    def test_PUT_임의_경로_410_반환(self, client):
        """AC-GD-01: PUT /api/v1/generations/any → 410."""
        resp = client.put("/api/v1/generations/any-path", json={})

        assert resp.status_code == 410

    def test_DELETE_임의_경로_410_반환(self, client):
        """AC-GD-01: DELETE /api/v1/generations/any → 410."""
        resp = client.delete("/api/v1/generations/any-path")

        assert resp.status_code == 410

    def test_중첩_경로_410_반환(self, client):
        """AC-GD-01: 중첩 경로 /api/v1/generations/a/b/c → 410."""
        resp = client.get("/api/v1/generations/a/b/c")

        assert resp.status_code == 410

    def test_410_응답_detail에_sessions_엔드포인트_안내_포함(self, client):
        """AC-GD-01: 응답 메시지에 /sessions 엔드포인트 안내."""
        resp = client.get("/api/v1/generations/old-endpoint")

        detail = resp.json().get("detail", "")
        assert "/sessions" in detail
