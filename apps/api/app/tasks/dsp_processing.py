import uuid
import time
import tempfile
import os
import shutil
import boto3
import structlog
from datetime import datetime, timezone, timedelta
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from botocore.exceptions import ClientError
from sqlalchemy import select, update

from app.core.db import SyncSessionLocal
from app.core.config import settings
from app.models.recording import Recording
from app.models.master_audio import MasterAudio
from app.models.generation_counter import GenerationCounter
# VoiceSample/GeneratedTrack: 직접 사용하지 않지만 SQLAlchemy mapper 전체 초기화를 위해 import.
# VoiceSample.user.back_populates="voice_samples" 및 VoiceSample.generated_tracks가
# 이 두 모델을 참조하므로, mapper configure 시 찾을 수 있어야 한다.
from app.models.voice_sample import VoiceSample  # noqa: F401
from app.models.generated_track import GeneratedTrack  # noqa: F401
from app.services.counter_service import PAID_ENTITLEMENTS
from app.services.dsp import get_dsp_service
from app.services.storage_service import upload_mp3, delete_object

logger = structlog.get_logger()

SAMPLE_DELETE_DELAY_HOURS = 24
MAX_RETRIES = 3
# exponential backoff 간격 (초): retry 0→60s, 1→180s, 2→600s
BACKOFF_DELAYS = [60, 180, 600]


def _s3_download(s3_key: str, local_path: str) -> None:
    """boto3 직접 S3 다운로드 (storage_service에 download_file 미존재)."""
    client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.S3_ENDPOINT_URL} if settings.S3_ENDPOINT_URL else {}),
    )
    client.download_file(settings.S3_BUCKET_NAME, s3_key, local_path)


def _s3_download_mock(s3_key: str, local_path: str) -> None:
    """MOCK_S3=true 환경: /static/ 로컬 경로에서 복사."""
    from app.core.config import STATIC_ROOT
    src = STATIC_ROOT / s3_key
    if src.exists():
        shutil.copy2(str(src), local_path)
    else:
        # 파일 없어도 빈 wav 생성 (DSP mock이 처리)
        with open(local_path, "wb") as f:
            f.write(b"")


@shared_task(
    name="tasks.dsp_process",
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=60,     # 기본 60초. countdown override로 exponential backoff 적용
    acks_late=True,
    soft_time_limit=35,         # 30초 NFR + 5초 버퍼
    time_limit=60,              # Celery 강제 종료
)
def dsp_process_task(
    self,
    session_id: str,
    master_audio_id: str,
    user_id: str,
    entitlement: str,
):
    """
    DSP 처리 Celery task.

    Retry 정책 (DESIGN_VALIDATION advisory 반영):
    - max_retries=3
    - countdown=exponential backoff (60/180/600s)
    - on_failure: master_audios.status=failed + Sentry 알림 (structlog.error fallback)
    """
    _session_id = uuid.UUID(session_id)
    _master_id  = uuid.UUID(master_audio_id)
    _user_id    = uuid.UUID(user_id)

    logger.info("dsp_task.start", session_id=session_id, master_id=master_audio_id)

    # ── 재실행 가드: acks_late=True 환경에서 worker 크래시 후 중복 실행 방지 ──
    with SyncSessionLocal() as db:
        master = db.get(MasterAudio, _master_id)
        if master and master.status == "completed":
            logger.info("dsp_task.already_completed", master_id=master_audio_id)
            return

    dsp = get_dsp_service()
    tmp_dir = tempfile.mkdtemp(prefix="jajang_dsp_")
    output_path = os.path.join(tmp_dir, "master.mp3")

    try:
        # Step 1: status → processing
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == _master_id)
                .values(status="processing")
            )
            db.commit()

        # Step 2: 녹음 클립 조회 (validated 클립만)
        with SyncSessionLocal() as db:
            result = db.execute(
                select(Recording)
                .where(
                    Recording.session_id == _session_id,
                    Recording.is_validated == True,  # noqa: E712
                    Recording.s3_key.isnot(None),
                )
            )
            recordings = result.scalars().all()

        if not recordings:
            raise RuntimeError("No validated recordings found for session")

        # Step 3: S3 다운로드 (MOCK_S3 분기 포함)
        clip_paths = []
        for rec in recordings:
            local_path = os.path.join(tmp_dir, f"{rec.id}.wav")
            if settings.MOCK_S3:
                _s3_download_mock(rec.s3_key, local_path)
            else:
                _s3_download(rec.s3_key, local_path)
            clip_paths.append(local_path)

        start_ms = int(time.monotonic() * 1000)

        # Step 4: DSP 처리
        dsp.process(
            clip_paths=clip_paths,
            output_path=output_path,
            previous_clip_index=None,  # 최초 생성 — 직전 클립 제외 없음
        )

        dsp_duration_ms = int(time.monotonic() * 1000) - start_ms

        # Step 5: S3 업로드 — upload_mp3는 bytes 인자. Path에서 읽어 전달.
        with open(output_path, "rb") as f:
            mp3_bytes = f.read()
        s3_key = upload_mp3(
            user_id=_user_id,
            track_id=_master_id,   # master_audio.id를 track_id 위치에 전달 (s3 prefix = tracks/{user}/{master_id}.mp3)
            mp3_bytes=mp3_bytes,
        )

        # Step 6: DB 업데이트 (completed + counter +1 + 클립 삭제 예약)
        schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == _master_id)
                .values(
                    status="completed",
                    s3_key=s3_key,
                    dsp_duration_ms=dsp_duration_ms,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            db.execute(
                update(Recording)
                .where(Recording.session_id == _session_id)
                .values(schedule_delete_at=schedule_delete)
            )
            # 무료 유저만 카운터 +1 (generation.py 패턴 준용 — last_generated_at + updated_at 함께)
            if entitlement not in PAID_ENTITLEMENTS:
                db.execute(
                    update(GenerationCounter)
                    .where(GenerationCounter.user_id == _user_id)
                    .values(
                        count=GenerationCounter.count + 1,
                        last_generated_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                    )
                    .execution_options(synchronize_session=False)
                )
            db.commit()

        logger.info(
            "dsp_task.completed",
            session_id=session_id,
            s3_key=s3_key,
            dsp_duration_ms=dsp_duration_ms,
        )

    except SoftTimeLimitExceeded:
        # SoftTimeLimitExceeded: db 스코프 밖 → 독립 세션으로 실패 처리
        logger.error("dsp_task.timeout", session_id=session_id)
        _fail_task_new_session(_master_id, "timeout: exceeded 30s soft limit")

    except Exception as exc:
        logger.error("dsp_task.error", session_id=session_id, exc=str(exc))
        # exponential backoff: 60s / 180s / 600s
        retry_count = self.request.retries
        if retry_count < MAX_RETRIES:
            countdown = BACKOFF_DELAYS[retry_count]
            raise self.retry(exc=exc, countdown=countdown)
        else:
            # 최대 재시도 소진 → on_failure
            _fail_task_final(_master_id, str(exc))

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _fail_task_new_session(master_id: uuid.UUID, error_message: str) -> None:
    """독립 세션으로 즉시 실패 처리 (타임아웃 케이스 — 기존 db 스코프 밖)."""
    try:
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == master_id)
                .values(status="failed", error_message=error_message)
            )
            db.commit()
    except Exception:
        pass


def _fail_task_final(master_id: uuid.UUID, error_message: str) -> None:
    """재시도 소진 후 최종 실패 처리 + Sentry 알림."""
    logger.error(
        "dsp_task.final_failure",
        master_id=str(master_id),
        error_message=error_message,
        alert="SENTRY_NOTIFY",    # Sentry SDK 설정 시 자동 capture_exception
    )
    try:
        with SyncSessionLocal() as db:
            db.execute(
                update(MasterAudio)
                .where(MasterAudio.id == master_id)
                .values(status="failed", error_message=f"max_retries exceeded: {error_message}")
            )
            db.commit()
    except Exception:
        pass


# bind=True task에서 __wrapped__가 bound method로 설정되어 테스트에서 직접 호출 불가.
# __wrapped__.__func__ (unbound, self 포함 시그니처)로 교체하여 테스트 호환성 보장.
dsp_process_task.__wrapped__ = dsp_process_task.__wrapped__.__func__


@shared_task(name="tasks.clip_cleanup")
def clip_cleanup_task():
    """
    1시간 주기 실행. schedule_delete_at <= NOW() 인 recordings S3 삭제 후 s3_key = NULL.
    S3 삭제 실패 시 해당 레코드 스킵 — 다음 주기에 재시도.
    """
    now = datetime.now(timezone.utc)

    with SyncSessionLocal() as db:
        result = db.execute(
            select(Recording)
            .where(
                Recording.schedule_delete_at <= now,
                Recording.s3_key.isnot(None),
            )
        )
        targets = result.scalars().all()

        for rec in targets:
            s3_key = rec.s3_key
            try:
                delete_object(s3_key)   # storage_service.delete_object (실존 함수명)
                db.execute(
                    update(Recording)
                    .where(Recording.id == rec.id)
                    .values(s3_key=None)
                )
                logger.info("clip.deleted", recording_id=str(rec.id), s3_key=s3_key)
            except Exception as e:
                logger.warning("clip.delete_failed", recording_id=str(rec.id), error=str(e))
                # schedule_delete_at 유지 → 다음 주기에 재시도

        db.commit()
