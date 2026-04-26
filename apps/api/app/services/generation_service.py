import uuid

import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.generated_track import GeneratedTrack
from app.schemas.generations import GenerationStatusResponse
from app.services import storage_service

logger = structlog.get_logger()


async def get_generation_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> GenerationStatusResponse:
    """
    GET /generations/{job_id} — 폴링 엔드포인트.
    클라이언트는 5초 간격으로 호출.
    status='completed' 시 presigned URL(1h) 포함 반환.
    """
    result = await db.execute(
        select(GeneratedTrack).where(
            GeneratedTrack.job_id == job_id,
            GeneratedTrack.user_id == user_id,
        )
    )
    track = result.scalar_one_or_none()

    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="생성 작업을 찾을 수 없어요.",
        )

    presigned_url = None
    if track.status == "completed" and track.s3_key:
        presigned_url = storage_service.generate_presigned_url(track.s3_key)

    return GenerationStatusResponse(
        job_id=str(track.job_id),
        track_id=str(track.id),
        status=track.status,
        presigned_url=presigned_url,
        error_message=track.error_message,
        queue_position=None,    # 향후 Celery queue depth 조회로 구현
    )
