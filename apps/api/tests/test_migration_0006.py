"""
REQ-0006 — Alembic 마이그레이션 0006 (DSP 녹음 모델) 테스트

커버 범위:
  AC-1  alembic upgrade head → 0006 오류 없음
  AC-2  alembic downgrade -1 → 롤백 정상 (신규 3 테이블 삭제 + 구 테이블 재생성)
  AC-3  recording_sessions.idempotency_key 중복 INSERT → UNIQUE 위반
  AC-4  master_audios.status = 'unknown' INSERT → CHECK constraint 위반
  AC-5  Recording.session 역참조 정상 (session.recordings 조회)
  AC-6  MasterAudio.session 역참조 정상
  AC-7  user.recording_sessions 역참조 정상 (User → RecordingSession)
  AC-8  voice_samples / generated_tracks 테이블 0006 이후 존재하지 않음
  AC-9  song_key 유효하지 않은 값 INSERT → CHECK constraint 위반

통합 테스트(AC-1, AC-2, AC-3, AC-4, AC-8, AC-9): PostgreSQL 필요.
  → pytest marker `pg_required` — PostgreSQL 미설정 시 자동 skip.

ORM 단위 테스트(AC-5, AC-6, AC-7): SQLAlchemy session mock 사용.
"""

import os
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, AsyncMock

import pytest
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

# ── PostgreSQL 연결 가능 여부 판단 ──────────────────────────────────────────
_PG_URL = os.environ.get("DATABASE_URL", "")
_PG_AVAILABLE = _PG_URL.startswith("postgresql")

pg_required = pytest.mark.skipif(
    not _PG_AVAILABLE,
    reason="PostgreSQL 연결 필요 (DATABASE_URL=postgresql://...). CI/CD 에서만 실행.",
)


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures — PostgreSQL 통합 테스트용
# ══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
def pg_engine():
    """PostgreSQL 동기 엔진 — alembic 통합 테스트 전용."""
    import sqlalchemy

    engine = sqlalchemy.create_engine(
        _PG_URL.replace("+asyncpg", ""),  # psycopg2 동기 엔진으로 변환
        isolation_level="AUTOCOMMIT",
    )
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def alembic_cfg(tmp_path_factory):
    """alembic.Config — apps/api 루트 기준."""
    from alembic.config import Config

    api_root = os.path.join(os.path.dirname(__file__), "..")
    cfg = Config(os.path.join(api_root, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(api_root, "alembic"))
    cfg.set_main_option(
        "sqlalchemy.url", _PG_URL.replace("+asyncpg", "")
    )
    return cfg


@pytest.fixture()
def at_revision_0005(alembic_cfg, pg_engine):
    """
    테스트 실행 전 DB를 0005 상태로 보장.
    테스트 종료 후 head까지 다시 upgrade(정리용).
    """
    from alembic import command

    # 일단 0005까지 올림 (이미 0005면 no-op)
    command.upgrade(alembic_cfg, "0005")
    yield
    # teardown: 항상 head로 복구
    command.upgrade(alembic_cfg, "head")


@pytest.fixture()
def at_head(alembic_cfg):
    """테스트 실행 전 head(0006)까지 업그레이드 보장."""
    from alembic import command

    command.upgrade(alembic_cfg, "head")
    yield


@pytest.fixture()
def pg_conn(pg_engine):
    """PostgreSQL 동기 커넥션 — DDL 검증용."""
    with pg_engine.connect() as conn:
        yield conn


# ══════════════════════════════════════════════════════════════════════════════
# AC-1 — alembic upgrade head (0006) 오류 없음
# ══════════════════════════════════════════════════════════════════════════════


class TestAC1_UpgradeTo0006:
    """REQ-0006 AC-1 — upgrade head 실행 시 예외 없이 완료."""

    @pg_required
    def test_upgrade_0006_예외_없이_완료된다(self, alembic_cfg, at_revision_0005):
        from alembic import command

        # at_revision_0005 픽스처가 0005 보장 → 0006 단일 step upgrade
        command.upgrade(alembic_cfg, "head")  # 예외 없으면 PASS

    @pg_required
    def test_upgrade_후_recording_sessions_테이블_존재(self, at_head, pg_conn):
        inspector = sa_inspect(pg_conn)
        table_names = inspector.get_table_names()
        assert "recording_sessions" in table_names

    @pg_required
    def test_upgrade_후_recordings_테이블_존재(self, at_head, pg_conn):
        inspector = sa_inspect(pg_conn)
        assert "recordings" in inspector.get_table_names()

    @pg_required
    def test_upgrade_후_master_audios_테이블_존재(self, at_head, pg_conn):
        inspector = sa_inspect(pg_conn)
        assert "master_audios" in inspector.get_table_names()


# ══════════════════════════════════════════════════════════════════════════════
# AC-2 — alembic downgrade -1 롤백 정상
# ══════════════════════════════════════════════════════════════════════════════


class TestAC2_Downgrade:
    """REQ-0006 AC-2 — downgrade -1 후 신규 테이블 삭제 + 구 테이블 재생성."""

    @pg_required
    def test_downgrade_후_recording_sessions_삭제된다(
        self, alembic_cfg, at_head, pg_conn
    ):
        from alembic import command

        command.downgrade(alembic_cfg, "-1")
        inspector = sa_inspect(pg_conn)
        assert "recording_sessions" not in inspector.get_table_names()

    @pg_required
    def test_downgrade_후_recordings_삭제된다(self, alembic_cfg, at_head, pg_conn):
        from alembic import command

        command.downgrade(alembic_cfg, "-1")
        inspector = sa_inspect(pg_conn)
        assert "recordings" not in inspector.get_table_names()

    @pg_required
    def test_downgrade_후_master_audios_삭제된다(self, alembic_cfg, at_head, pg_conn):
        from alembic import command

        command.downgrade(alembic_cfg, "-1")
        inspector = sa_inspect(pg_conn)
        assert "master_audios" not in inspector.get_table_names()

    @pg_required
    def test_downgrade_후_voice_samples_재생성된다(
        self, alembic_cfg, at_head, pg_conn
    ):
        from alembic import command

        command.downgrade(alembic_cfg, "-1")
        inspector = sa_inspect(pg_conn)
        assert "voice_samples" in inspector.get_table_names()

    @pg_required
    def test_downgrade_후_generated_tracks_재생성된다(
        self, alembic_cfg, at_head, pg_conn
    ):
        from alembic import command

        command.downgrade(alembic_cfg, "-1")
        inspector = sa_inspect(pg_conn)
        assert "generated_tracks" in inspector.get_table_names()


# ══════════════════════════════════════════════════════════════════════════════
# AC-3 — idempotency_key 중복 INSERT → UNIQUE 위반
# ══════════════════════════════════════════════════════════════════════════════


class TestAC3_IdempotencyKeyUnique:
    """REQ-0006 AC-3 — recording_sessions.idempotency_key UNIQUE constraint."""

    @pg_required
    def test_동일_idempotency_key_두번_insert_시_integrity_error(
        self, at_head, pg_engine
    ):
        from sqlalchemy.exc import IntegrityError

        idempotency_key = uuid.uuid4()
        user_id = uuid.uuid4()

        row = {
            "id": uuid.uuid4(),
            "user_id": user_id,
            "song_key": "brahms",
            "status": "open",
            "idempotency_key": idempotency_key,
        }

        with pg_engine.begin() as conn:
            # 선행 조건: user 행이 없으면 FK 위반 → 임시로 FK 검사 비활성 후 테스트
            # (테스트 DB에 실제 user 없으므로 FK 비활성화 or user 먼저 insert)
            conn.execute(sa.text("SET session_replication_role = replica"))
            conn.execute(
                sa.text(
                    "INSERT INTO recording_sessions "
                    "(id, user_id, song_key, status, idempotency_key) "
                    "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                ),
                row,
            )

            with pytest.raises(IntegrityError):
                conn.execute(
                    sa.text(
                        "INSERT INTO recording_sessions "
                        "(id, user_id, song_key, status, idempotency_key) "
                        "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                    ),
                    {**row, "id": uuid.uuid4()},  # id만 다른 중복 idempotency_key
                )

    @pg_required
    def test_다른_idempotency_key는_insert_성공(self, at_head, pg_engine):
        """서로 다른 idempotency_key → UNIQUE 위반 없음."""
        user_id = uuid.uuid4()

        def _row(ikey):
            return {
                "id": uuid.uuid4(),
                "user_id": user_id,
                "song_key": "mozart",
                "status": "open",
                "idempotency_key": ikey,
            }

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            conn.execute(
                sa.text(
                    "INSERT INTO recording_sessions "
                    "(id, user_id, song_key, status, idempotency_key) "
                    "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                ),
                _row(uuid.uuid4()),
            )
            conn.execute(
                sa.text(
                    "INSERT INTO recording_sessions "
                    "(id, user_id, song_key, status, idempotency_key) "
                    "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                ),
                _row(uuid.uuid4()),
            )  # 예외 없으면 PASS


# ══════════════════════════════════════════════════════════════════════════════
# AC-4 — master_audios.status = 'unknown' → CHECK constraint 위반
# ══════════════════════════════════════════════════════════════════════════════


class TestAC4_MasterAudioStatusCheck:
    """REQ-0006 AC-4 — master_audios CHECK constraint: 허용 외 status 거부."""

    @pg_required
    def test_허용외_status_unknown_insert_시_integrity_error(
        self, at_head, pg_engine
    ):
        from sqlalchemy.exc import IntegrityError

        session_id = uuid.uuid4()

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            # 선행 session 행 삽입 (FK 비활성 상태이므로 session_id 실재 불필요)
            with pytest.raises(IntegrityError):
                conn.execute(
                    sa.text(
                        "INSERT INTO master_audios (id, session_id, status) "
                        "VALUES (:id, :session_id, :status)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "session_id": session_id,
                        "status": "unknown",  # CHECK constraint 위반
                    },
                )

    @pg_required
    def test_허용_status_pending_insert_성공(self, at_head, pg_engine):
        """status='pending' → CHECK 통과."""
        session_id = uuid.uuid4()

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            # 먼저 session 행 삽입
            conn.execute(
                sa.text(
                    "INSERT INTO recording_sessions "
                    "(id, user_id, song_key, status, idempotency_key) "
                    "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                ),
                {
                    "id": session_id,
                    "user_id": uuid.uuid4(),
                    "song_key": "hush",
                    "status": "open",
                    "idempotency_key": uuid.uuid4(),
                },
            )
            conn.execute(
                sa.text(
                    "INSERT INTO master_audios (id, session_id, status) "
                    "VALUES (:id, :session_id, :status)"
                ),
                {
                    "id": uuid.uuid4(),
                    "session_id": session_id,
                    "status": "pending",
                },
            )  # 예외 없으면 PASS

    @pg_required
    def test_master_audio_session당_하나만_허용_duplicate_session_id_위반(
        self, at_head, pg_engine
    ):
        """session_id UNIQUE — 동일 세션에 master_audio 두 번 INSERT 시 위반."""
        from sqlalchemy.exc import IntegrityError

        session_id = uuid.uuid4()

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            conn.execute(
                sa.text(
                    "INSERT INTO recording_sessions "
                    "(id, user_id, song_key, status, idempotency_key) "
                    "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                ),
                {
                    "id": session_id,
                    "user_id": uuid.uuid4(),
                    "song_key": "twinkle",
                    "status": "open",
                    "idempotency_key": uuid.uuid4(),
                },
            )
            conn.execute(
                sa.text(
                    "INSERT INTO master_audios (id, session_id, status) "
                    "VALUES (:id, :session_id, :status)"
                ),
                {"id": uuid.uuid4(), "session_id": session_id, "status": "pending"},
            )
            with pytest.raises(IntegrityError):
                conn.execute(
                    sa.text(
                        "INSERT INTO master_audios (id, session_id, status) "
                        "VALUES (:id, :session_id, :status)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "session_id": session_id,
                        "status": "processing",
                    },
                )


# ══════════════════════════════════════════════════════════════════════════════
# AC-5 — Recording.session 역참조 (session.recordings 조회)
# ══════════════════════════════════════════════════════════════════════════════


class TestAC5_RecordingSessionBackref:
    """REQ-0006 AC-5 — Recording.session relationship back_populates 구조 검증."""

    def test_RecordingSession_recordings_속성이_존재한다(self):
        """ORM 클래스 로드 시 recordings relationship이 정의되어 있어야 한다."""
        from app.models.recording_session import RecordingSession

        assert hasattr(RecordingSession, "recordings")

    def test_Recording_session_속성이_존재한다(self):
        """Recording.session 역참조 속성이 존재해야 한다."""
        from app.models.recording import Recording

        assert hasattr(Recording, "session")

    def test_Recording_session_back_populates_가_올바른_속성명을_가리킨다(self):
        """Recording.session → RecordingSession.recordings back_populates 체인 검증."""
        from app.models.recording import Recording
        from app.models.recording_session import RecordingSession

        rec_session_rel = Recording.session.property
        assert rec_session_rel.back_populates == "recordings"

    def test_session_recordings_관계로_Recording_인스턴스_조회_가능(self):
        """
        ORM 인스턴스 레벨 — session.recordings 에 Recording 추가 후 역참조 확인.
        DB 없이 순수 ORM 인스턴스로 검증.
        """
        from app.models.recording_session import RecordingSession
        from app.models.recording import Recording

        session = RecordingSession(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            song_key="brahms",
            status="open",
            idempotency_key=uuid.uuid4(),
        )
        recording = Recording(
            id=uuid.uuid4(),
            session_id=session.id,
            is_validated=False,
        )
        session.recordings.append(recording)

        assert len(session.recordings) == 1
        assert session.recordings[0] is recording


# ══════════════════════════════════════════════════════════════════════════════
# AC-6 — MasterAudio.session 역참조 정상
# ══════════════════════════════════════════════════════════════════════════════


class TestAC6_MasterAudioBackref:
    """REQ-0006 AC-6 — MasterAudio.session relationship 구조 검증."""

    def test_MasterAudio_session_속성이_존재한다(self):
        from app.models.master_audio import MasterAudio

        assert hasattr(MasterAudio, "session")

    def test_RecordingSession_master_audio_속성이_존재한다(self):
        from app.models.recording_session import RecordingSession

        assert hasattr(RecordingSession, "master_audio")

    def test_MasterAudio_session_back_populates_가_올바른_속성명을_가리킨다(self):
        from app.models.master_audio import MasterAudio

        ma_session_rel = MasterAudio.session.property
        assert ma_session_rel.back_populates == "master_audio"

    def test_master_audio_uselist_false로_단일_객체_반환(self):
        """RecordingSession.master_audio 는 uselist=False (1:1 관계)."""
        from app.models.recording_session import RecordingSession

        prop = RecordingSession.master_audio.property
        assert prop.uselist is False

    def test_session_master_audio_ORM_인스턴스_할당_가능(self):
        """
        ORM 인스턴스 레벨 — session.master_audio 할당 후 역참조 확인.
        """
        from app.models.recording_session import RecordingSession
        from app.models.master_audio import MasterAudio

        session = RecordingSession(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            song_key="mozart",
            status="generating",
            idempotency_key=uuid.uuid4(),
        )
        master = MasterAudio(
            id=uuid.uuid4(),
            session_id=session.id,
            status="pending",
        )
        session.master_audio = master

        assert session.master_audio is master


# ══════════════════════════════════════════════════════════════════════════════
# AC-7 — user.recording_sessions 역참조 (User → RecordingSession)
# ══════════════════════════════════════════════════════════════════════════════


class TestAC7_UserRecordingSessionsBackref:
    """REQ-0006 AC-7 — User.recording_sessions relationship 구조 검증."""

    def test_User_recording_sessions_속성이_존재한다(self):
        from app.models.user import User

        assert hasattr(User, "recording_sessions")

    def test_RecordingSession_user_속성이_존재한다(self):
        from app.models.recording_session import RecordingSession

        assert hasattr(RecordingSession, "user")

    def test_RecordingSession_user_back_populates_가_올바른_속성명을_가리킨다(self):
        from app.models.recording_session import RecordingSession

        prop = RecordingSession.user.property
        assert prop.back_populates == "recording_sessions"

    def test_User_recording_sessions_back_populates_가_올바른_속성명을_가리킨다(self):
        from app.models.user import User

        prop = User.recording_sessions.property
        assert prop.back_populates == "user"

    def test_user_recording_sessions_ORM_인스턴스_조회_가능(self):
        """
        ORM 인스턴스 레벨 — user.recording_sessions 에 세션 추가 후 역참조 확인.
        """
        from app.models.user import User
        from app.models.recording_session import RecordingSession

        user = User(
            id=uuid.uuid4(),
            provider="apple",
            provider_uid="uid_test_007",
            privacy_consent_given=True,
        )
        session = RecordingSession(
            id=uuid.uuid4(),
            user_id=user.id,
            song_key="rockabye",
            status="open",
            idempotency_key=uuid.uuid4(),
        )
        user.recording_sessions.append(session)

        assert len(user.recording_sessions) == 1
        assert user.recording_sessions[0] is session


# ══════════════════════════════════════════════════════════════════════════════
# AC-8 — voice_samples / generated_tracks 테이블 0006 이후 존재하지 않음
# ══════════════════════════════════════════════════════════════════════════════


class TestAC8_OldTablesDropped:
    """REQ-0006 AC-8 — upgrade 후 구 테이블 부재 확인."""

    @pg_required
    def test_0006_upgrade_후_voice_samples_테이블_없음(self, at_head, pg_conn):
        inspector = sa_inspect(pg_conn)
        assert "voice_samples" not in inspector.get_table_names()

    @pg_required
    def test_0006_upgrade_후_generated_tracks_테이블_없음(self, at_head, pg_conn):
        inspector = sa_inspect(pg_conn)
        assert "generated_tracks" not in inspector.get_table_names()

    def test_models_init에서_VoiceSample_import_불가(self):
        """
        app.models 에서 VoiceSample 을 직접 import 하면 ImportError/AttributeError.
        (models/__init__.py 에서 제거 확인)
        """
        import importlib
        import app.models as models_pkg

        assert not hasattr(models_pkg, "VoiceSample"), (
            "VoiceSample 이 app.models 에 여전히 노출됨 — __init__.py 에서 제거 필요"
        )

    def test_models_init에서_GeneratedTrack_import_불가(self):
        import app.models as models_pkg

        assert not hasattr(models_pkg, "GeneratedTrack"), (
            "GeneratedTrack 이 app.models 에 여전히 노출됨 — __init__.py 에서 제거 필요"
        )

    def test_models_init에_신규_세_모델_노출됨(self):
        """app.models 에 신규 3개 모델이 모두 노출되어야 한다."""
        import app.models as models_pkg

        assert hasattr(models_pkg, "RecordingSession")
        assert hasattr(models_pkg, "Recording")
        assert hasattr(models_pkg, "MasterAudio")


# ══════════════════════════════════════════════════════════════════════════════
# AC-9 — song_key 유효하지 않은 값 INSERT → CHECK constraint 위반
# ══════════════════════════════════════════════════════════════════════════════


class TestAC9_SongKeyCheck:
    """REQ-0006 AC-9 (GAP-3 보강) — recording_sessions.song_key CHECK constraint."""

    @pg_required
    def test_허용외_song_key_beethoven_insert_시_integrity_error(
        self, at_head, pg_engine
    ):
        from sqlalchemy.exc import IntegrityError

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            with pytest.raises(IntegrityError):
                conn.execute(
                    sa.text(
                        "INSERT INTO recording_sessions "
                        "(id, user_id, song_key, status, idempotency_key) "
                        "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "user_id": uuid.uuid4(),
                        "song_key": "beethoven",  # 허용 목록 외
                        "status": "open",
                        "idempotency_key": uuid.uuid4(),
                    },
                )

    @pg_required
    def test_허용_song_key_전체_6개_insert_성공(self, at_head, pg_engine):
        """허용된 song_key 6개 모두 CHECK 통과."""
        allowed_keys = ["brahms", "mozart", "schubert", "twinkle", "rockabye", "hush"]

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            for key in allowed_keys:
                conn.execute(
                    sa.text(
                        "INSERT INTO recording_sessions "
                        "(id, user_id, song_key, status, idempotency_key) "
                        "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "user_id": uuid.uuid4(),
                        "song_key": key,
                        "status": "open",
                        "idempotency_key": uuid.uuid4(),
                    },
                )  # 예외 없으면 PASS

    @pg_required
    def test_recording_sessions_status_허용외_값_insert_시_integrity_error(
        self, at_head, pg_engine
    ):
        """status CHECK — 'cancelled' 같은 허용 외 값 거부."""
        from sqlalchemy.exc import IntegrityError

        with pg_engine.begin() as conn:
            conn.execute(sa.text("SET session_replication_role = replica"))
            with pytest.raises(IntegrityError):
                conn.execute(
                    sa.text(
                        "INSERT INTO recording_sessions "
                        "(id, user_id, song_key, status, idempotency_key) "
                        "VALUES (:id, :user_id, :song_key, :status, :idempotency_key)"
                    ),
                    {
                        "id": uuid.uuid4(),
                        "user_id": uuid.uuid4(),
                        "song_key": "brahms",
                        "status": "cancelled",  # 허용 외
                        "idempotency_key": uuid.uuid4(),
                    },
                )
