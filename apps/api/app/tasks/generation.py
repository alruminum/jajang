import uuid
from datetime import datetime, timezone, timedelta

import structlog
from celery import shared_task
from celery.utils.log import get_task_logger
from sqlalchemy import update

from app.core.db import SyncSessionLocal
from app.models.generated_track import GeneratedTrack
from app.models.generation_counter import GenerationCounter
from app.models.voice_sample import VoiceSample
from app.services.inference.factory import get_inference_client
from app.services.inference.base import InferenceInput
from app.services import storage_service
from app.services.counter_service import PAID_ENTITLEMENTS

logger = structlog.get_logger()
task_logger = get_task_logger(__name__)

SAMPLE_DELETE_DELAY_HOURS = 24     # Story 4: 샘플 삭제 예약 시간
GENERATION_TIMEOUT_SECONDS = 90    # NFR: 90초 이내 (trd.md §9)


@shared_task(
    name="tasks.generate_track",
    bind=True,
    max_retries=0,           # 재시도 없음 — 클라이언트가 동일 job_id로 재시도
    acks_late=True,          # task 완료 후 ack → worker 크래시 시 재실행 방지
    time_limit=120,          # Celery 강제 종료 시간 (90s 추론 + 30s 버퍼)
    soft_time_limit=95,      # SoftTimeLimitExceeded → 정상 실패 처리
)
def generate_track_task(
    self,
    track_id: str,
    job_id: str,
    user_id: str,
    entitlement: str,
    voice_sample_id: str,
    song_key: str,
    s3_sample_key: str,
):
    """
    GPU 추론 + mp3 S3 업로드 + 상태 업데이트.

    실행 순서:
    1. status = 'processing'
    2. VoiceInferenceClient.generate() 호출 (최대 90초)
    3a. 성공: mp3 S3 업로드 → status='completed' + counter +1 + sample 삭제 예약
    3b. 실패: status='failed' + error_message + sample 삭제 예약
    """
    from celery.exceptions import SoftTimeLimitExceeded

    _track_id = uuid.UUID(track_id)
    _job_id   = uuid.UUID(job_id)
    _user_id  = uuid.UUID(user_id)
    _sample_id = uuid.UUID(voice_sample_id)

    logger.info(
        "generation.task.start",
        job_id=job_id,
        track_id=track_id,
        song_key=song_key,
    )

    with SyncSessionLocal() as db:
        # acks_late=True 환경에서 worker 크래시 후 재실행 시 중복 처리 방지
        existing = db.get(GeneratedTrack, _track_id)
        if existing and existing.status == "completed":
            logger.info(
                "generation.task.already_completed",
                track_id=track_id,
                job_id=job_id,
            )
            return

        # ── Step 1: status → processing ────────────────────────
        db.execute(
            update(GeneratedTrack)
            .where(GeneratedTrack.id == _track_id)
            .values(status="processing")
        )
        db.commit()

        # ── Step 2: GPU 추론 ────────────────────────────────────
        client = get_inference_client()
        inference_input = InferenceInput(
            s3_sample_key=s3_sample_key,
            song_key=song_key,
            job_id=_job_id,
        )

        try:
            result = client.generate(inference_input)
        except SoftTimeLimitExceeded:
            # Celery soft time limit (95s) 초과 → 타임아웃 처리
            error_msg  = "timeout: exceeded 90 seconds"
            elapsed_ms = GENERATION_TIMEOUT_SECONDS * 1000
            logger.warning("generation.task.timeout", job_id=job_id)
            _fail_track(db, _track_id, _sample_id, error_msg, elapsed_ms)
            return

        if result.success:
            # ── Step 3a: 성공 처리 ─────────────────────────────
            s3_key = storage_service.upload_mp3(
                user_id=_user_id,
                track_id=_track_id,
                mp3_bytes=result.mp3_bytes,
            )

            schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

            db.execute(
                update(GeneratedTrack)
                .where(GeneratedTrack.id == _track_id)
                .values(
                    status="completed",
                    s3_key=s3_key,
                    gpu_duration_ms=result.duration_ms,
                    completed_at=datetime.now(timezone.utc),
                )
            )

            # counter +1 (무료 유저만, 성공 시에만)
            # counter_service.increment_on_success는 async이므로 동기 버전을 인라인 처리
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
                logger.info("generation.counter.incremented", user_id=user_id)

            # voice_sample 삭제 예약 (Story 4)
            db.execute(
                update(VoiceSample)
                .where(VoiceSample.id == _sample_id)
                .values(schedule_delete_at=schedule_delete)
            )

            db.commit()

            logger.info(
                "generation.task.completed",
                job_id=job_id,
                track_id=track_id,
                s3_key=s3_key,
                duration_ms=result.duration_ms,
            )

        else:
            # ── Step 3b: 실패 처리 ─────────────────────────────
            _fail_track(db, _track_id, _sample_id, result.error_message or "unknown", result.duration_ms)


def _fail_track(
    db,
    track_id: uuid.UUID,
    sample_id: uuid.UUID,
    error_message: str,
    duration_ms: int,
) -> None:
    """실패 공통 처리: track failed + sample 삭제 예약"""
    schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

    db.execute(
        update(GeneratedTrack)
        .where(GeneratedTrack.id == track_id)
        .values(
            status="failed",
            error_message=error_message,
            gpu_duration_ms=duration_ms,
        )
    )
    # 실패해도 샘플 삭제 예약 (Story 4: 24h TTL 보장)
    db.execute(
        update(VoiceSample)
        .where(VoiceSample.id == sample_id)
        .values(schedule_delete_at=schedule_delete)
    )
    db.commit()

    logger.warning(
        "generation.task.failed",
        track_id=str(track_id),
        error_message=error_message,
        duration_ms=duration_ms,
    )
