"""
REQ-CLEANUP-04 — clip_cleanup_task 단위 테스트 (TDD Red 단계)

커버 범위:
  AC-1  schedule_delete_at <= NOW() + s3_key IS NOT NULL → S3 삭제 + s3_key=None
  AC-2  schedule_delete_at IS NULL row → 스캔 제외 (변경 없음)
  AC-3  S3 DELETE 실패 → s3_key 유지 + structlog clip.delete_failed + 다음 주기 재시도
  AC-4  BATCH_LIMIT(500) 초과 row 존재 → 첫 500 row만 처리
  AC-7  structlog clip.deleted 기록 (recording_id, s3_key)
  AC-8  task 반환값 = {"deleted": int, "skipped": int, "errors": int}

의존성 패턴:
  - clip_cleanup_task: SyncSessionLocal(DB) + storage_service.delete_object(S3) 의존
  - 의존 mock 정상: deleted 카운트 증가 + s3_key=None update 흐름
  - 의존 mock 실패: errors 카운트 증가 + s3_key 유지 흐름
  - 의존 없을 때(만료 row 없음): 변경 없이 {"deleted":0,"skipped":0,"errors":0} 반환

구현 파일: apps/api/app/tasks/clip_cleanup.py (신규 — engineer 단계에서 생성)
이 테스트는 파일 부재 시 ImportError(TDD RED)로 자연 실패한다.
"""

import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, call

import pytest


# ══════════════════════════════════════════════════════════════════════════════
# Helpers — DB mock 빌더
# ══════════════════════════════════════════════════════════════════════════════


def _make_recording(s3_key="recordings/user/clip.wav", schedule_delete_at=None):
    """만료된 녹음 row mock 생성."""
    r = MagicMock()
    r.id = uuid.uuid4()
    r.s3_key = s3_key
    r.schedule_delete_at = schedule_delete_at or (
        datetime.now(timezone.utc) - timedelta(hours=2)
    )
    return r


def _db_context(rows):
    """
    SyncSessionLocal context manager mock.
    execute().scalars().all() → rows 반환.
    """
    db = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = rows
    execute_result = MagicMock()
    execute_result.scalars.return_value = scalars
    db.execute.return_value = execute_result

    ctx = MagicMock()
    ctx.__enter__ = MagicMock(return_value=db)
    ctx.__exit__ = MagicMock(return_value=False)
    return ctx, db


# ══════════════════════════════════════════════════════════════════════════════
# AC-1 — 만료 row: S3 삭제 + s3_key=None
# ══════════════════════════════════════════════════════════════════════════════


class TestAC1_ExpiredRowDeleted:
    """REQ-CLEANUP-04 AC-1 — schedule_delete_at <= NOW() + s3_key IS NOT NULL → S3 삭제 + s3_key=None."""

    def test_만료_row_delete_object_호출(self):
        """Given 만료된 row 1건, When clip_cleanup_task 실행, Then delete_object(s3_key) 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        s3_key = "recordings/user/clip.wav"
        rec = _make_recording(s3_key=s3_key)
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object") as mock_del:
                clip_cleanup_task()

        mock_del.assert_called_once_with(s3_key)

    def test_만료_row_s3_key_None_update_실행(self):
        """Given 만료된 row 1건 S3 삭제 성공, When clip_cleanup_task 실행, Then s3_key=None update execute 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording()
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                clip_cleanup_task()

        # select 1회 + update(s3_key=None) 1회 이상
        assert db.execute.call_count >= 2, (
            "SELECT + UPDATE(s3_key=None) 최소 2회 execute 호출 필요"
        )

    def test_만료_row_처리_후_commit_호출(self):
        """Given 만료된 row 1건, When clip_cleanup_task 실행, Then db.commit() 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording()
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                clip_cleanup_task()

        db.commit.assert_called_once()


# ══════════════════════════════════════════════════════════════════════════════
# AC-2 — schedule_delete_at IS NULL row → 스캔 제외
# ══════════════════════════════════════════════════════════════════════════════


class TestAC2_NullScheduleDeleteAtExcluded:
    """REQ-CLEANUP-04 AC-2 — schedule_delete_at IS NULL row → 쿼리 조건에서 제외."""

    def test_만료_row_없을_때_delete_object_미호출(self):
        """Given 만료 row 0건(IS NULL row만 존재 — 쿼리 필터에서 제외됨), When 실행, Then delete_object 미호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        # DB 쿼리가 IS NOT NULL + <= NOW() 조건으로 필터하므로 반환값이 빈 리스트
        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object") as mock_del:
                result = clip_cleanup_task()

        mock_del.assert_not_called()

    def test_만료_row_없을_때_반환값_deleted_0(self):
        """Given 만료 row 0건, When 실행, Then 반환 dict의 deleted=0."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert result["deleted"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# AC-3 — S3 DELETE 실패 → s3_key 유지 + clip.delete_failed 로그
# ══════════════════════════════════════════════════════════════════════════════


class TestAC3_S3DeleteFailure:
    """REQ-CLEANUP-04 AC-3 — S3 DELETE 실패 → s3_key 유지 + structlog clip.delete_failed."""

    def test_s3_삭제_실패_시_errors_카운트_증가(self):
        """Given delete_object가 Exception 발생, When 실행, Then 반환 dict errors=1."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording()
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object", side_effect=Exception("S3 error")):
                result = clip_cleanup_task()

        assert result["errors"] == 1

    def test_s3_삭제_실패_시_deleted_카운트_증가_안됨(self):
        """Given delete_object가 Exception 발생, When 실행, Then 반환 dict deleted=0 (성공 카운트 없음)."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording()
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object", side_effect=Exception("S3 error")):
                result = clip_cleanup_task()

        assert result["deleted"] == 0

    def test_s3_삭제_실패_시_structlog_clip_delete_failed_기록(self):
        """Given delete_object가 Exception 발생, When 실행, Then structlog warning clip.delete_failed 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording()
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object", side_effect=Exception("S3 error")):
                with patch("app.tasks.clip_cleanup.logger") as mock_logger:
                    clip_cleanup_task()

        # structlog logger.warning("clip.delete_failed", ...) 호출 검증
        mock_logger.warning.assert_called_once()
        event_arg = mock_logger.warning.call_args[0][0]
        assert event_arg == "clip.delete_failed", (
            f"structlog event 이름은 'clip.delete_failed' 이어야 한다. 실제: {event_arg}"
        )

    def test_s3_삭제_실패_시_다음_주기를_위해_task_전체_중단_안됨(self):
        """Given 두 row 중 첫 번째 S3 삭제 실패, When 실행, Then task가 예외 없이 완료."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec1 = _make_recording(s3_key="recordings/fail.wav")
        rec2 = _make_recording(s3_key="recordings/ok.wav")
        ctx, db = _db_context([rec1, rec2])

        def side_effect(key):
            if key == "recordings/fail.wav":
                raise Exception("S3 ClientError")

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object", side_effect=side_effect):
                # 예외 없이 정상 완료해야 함
                result = clip_cleanup_task()

        assert result["errors"] == 1
        assert result["deleted"] == 1


# ══════════════════════════════════════════════════════════════════════════════
# AC-4 — BATCH_LIMIT=500 초과 row → 첫 500 row만 처리
# ══════════════════════════════════════════════════════════════════════════════


class TestAC4_BatchLimit:
    """REQ-CLEANUP-04 AC-4 — BATCH_LIMIT 상수가 500이고 쿼리 limit에 적용."""

    def test_BATCH_LIMIT_상수_값이_500(self):
        """Given clip_cleanup 모듈, When BATCH_LIMIT 상수 조회, Then 500."""
        from app.tasks.clip_cleanup import BATCH_LIMIT

        assert BATCH_LIMIT == 500, (
            f"BATCH_LIMIT은 500이어야 한다. 실제: {BATCH_LIMIT}"
        )

    def test_501개_row_존재_시_delete_object_500회만_호출(self):
        """Given DB가 500건 반환(limit 적용 결과), When 실행, Then delete_object 500회 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rows = [_make_recording(s3_key=f"recordings/clip_{i}.wav") for i in range(500)]
        ctx, db = _db_context(rows)

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object") as mock_del:
                result = clip_cleanup_task()

        assert mock_del.call_count == 500, (
            f"delete_object 호출 횟수는 500이어야 한다. 실제: {mock_del.call_count}"
        )
        assert result["deleted"] == 500


# ══════════════════════════════════════════════════════════════════════════════
# AC-7 — structlog clip.deleted 기록
# ══════════════════════════════════════════════════════════════════════════════


class TestAC7_StructlogClipDeleted:
    """REQ-CLEANUP-04 AC-7 — S3 삭제 성공 시 structlog info clip.deleted 기록."""

    def test_s3_삭제_성공_시_structlog_clip_deleted_기록(self):
        """Given S3 삭제 성공, When 실행, Then structlog info('clip.deleted', recording_id=..., s3_key=...) 호출."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording(s3_key="recordings/user/clip.wav")
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                with patch("app.tasks.clip_cleanup.logger") as mock_logger:
                    clip_cleanup_task()

        # structlog logger.info("clip.deleted", ...) 호출 검증
        info_calls = [c for c in mock_logger.info.call_args_list if c[0][0] == "clip.deleted"]
        assert len(info_calls) == 1, (
            "S3 삭제 성공 시 'clip.deleted' structlog info 이벤트가 1회 기록되어야 한다"
        )

    def test_clip_deleted_로그에_recording_id_포함(self):
        """Given S3 삭제 성공, When 실행, Then clip.deleted 로그에 recording_id kwarg 포함."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec = _make_recording(s3_key="recordings/user/clip.wav")
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                with patch("app.tasks.clip_cleanup.logger") as mock_logger:
                    clip_cleanup_task()

        info_calls = [c for c in mock_logger.info.call_args_list if c[0][0] == "clip.deleted"]
        assert len(info_calls) == 1
        kwargs = info_calls[0][1]
        assert "recording_id" in kwargs, (
            "clip.deleted 로그에 recording_id kwarg가 있어야 한다"
        )

    def test_clip_deleted_로그에_s3_key_포함(self):
        """Given S3 삭제 성공, When 실행, Then clip.deleted 로그에 s3_key kwarg 포함."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        s3_key = "recordings/user/clip.wav"
        rec = _make_recording(s3_key=s3_key)
        ctx, db = _db_context([rec])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                with patch("app.tasks.clip_cleanup.logger") as mock_logger:
                    clip_cleanup_task()

        info_calls = [c for c in mock_logger.info.call_args_list if c[0][0] == "clip.deleted"]
        assert len(info_calls) == 1
        kwargs = info_calls[0][1]
        assert "s3_key" in kwargs, (
            "clip.deleted 로그에 s3_key kwarg가 있어야 한다"
        )
        assert kwargs["s3_key"] == s3_key


# ══════════════════════════════════════════════════════════════════════════════
# AC-8 — 반환값 dict {"deleted": int, "skipped": int, "errors": int}
# ══════════════════════════════════════════════════════════════════════════════


class TestAC8_ReturnValue:
    """REQ-CLEANUP-04 AC-8 — task 반환값 = {"deleted": int, "skipped": int, "errors": int}."""

    def test_반환값이_dict_타입(self):
        """Given 실행 완료, When 반환값 타입 확인, Then dict."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert isinstance(result, dict), (
            f"반환값은 dict이어야 한다. 실제 타입: {type(result)}"
        )

    def test_반환값에_deleted_키_존재(self):
        """Given 실행 완료, When 반환값 키 확인, Then 'deleted' 키 존재."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert "deleted" in result

    def test_반환값에_skipped_키_존재(self):
        """Given 실행 완료, When 반환값 키 확인, Then 'skipped' 키 존재."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert "skipped" in result

    def test_반환값에_errors_키_존재(self):
        """Given 실행 완료, When 반환값 키 확인, Then 'errors' 키 존재."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert "errors" in result

    def test_반환값_deleted_는_int_타입(self):
        """Given 실행 완료, When 반환값 타입 확인, Then deleted 값은 int."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert isinstance(result["deleted"], int)

    def test_반환값_errors_는_int_타입(self):
        """Given 실행 완료, When 반환값 타입 확인, Then errors 값은 int."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        ctx, db = _db_context([])

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object"):
                result = clip_cleanup_task()

        assert isinstance(result["errors"], int)

    def test_성공_1건_실패_1건_반환값_정합(self):
        """Given 2건 중 1건 성공 1건 실패, When 실행, Then deleted=1, errors=1, skipped=0."""
        from app.tasks.clip_cleanup import clip_cleanup_task

        rec_ok = _make_recording(s3_key="recordings/ok.wav")
        rec_fail = _make_recording(s3_key="recordings/fail.wav")
        ctx, db = _db_context([rec_ok, rec_fail])

        def side_effect(key):
            if key == "recordings/fail.wav":
                raise Exception("S3 error")

        with patch("app.tasks.clip_cleanup.SyncSessionLocal", return_value=ctx):
            with patch("app.tasks.clip_cleanup.delete_object", side_effect=side_effect):
                result = clip_cleanup_task()

        assert result["deleted"] == 1
        assert result["errors"] == 1
        assert result["skipped"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 상수 / task 시그니처 검증
# ══════════════════════════════════════════════════════════════════════════════


class TestTaskSignature:
    """REQ-CLEANUP-04 — clip_cleanup_task Celery 시그니처 + 상수 검증."""

    def test_BATCH_LIMIT_상수_임포트_가능(self):
        """clip_cleanup 모듈에서 BATCH_LIMIT 상수를 import할 수 있다."""
        from app.tasks.clip_cleanup import BATCH_LIMIT
        assert BATCH_LIMIT is not None

    def test_clip_cleanup_task_callable(self):
        """clip_cleanup_task가 callable이다."""
        from app.tasks.clip_cleanup import clip_cleanup_task
        assert callable(clip_cleanup_task)

    def test_max_retries_2(self):
        """
        @shared_task(max_retries=2) 선언 검증.
        Celery task의 max_retries 속성은 2이어야 한다.
        """
        from app.tasks.clip_cleanup import clip_cleanup_task
        # Celery shared_task로 등록된 경우 .max_retries 속성 접근
        assert getattr(clip_cleanup_task, "max_retries", None) == 2, (
            "clip_cleanup_task.max_retries는 2이어야 한다 (impl/04 §2 인터페이스 명세)"
        )
