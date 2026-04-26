import asyncio
import uuid
from datetime import datetime
from typing import Optional

import boto3
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.generated_track import GeneratedTrack
from app.schemas.tracks import TrackItem, TracksListResponse
from app.services import storage_service

logger = structlog.get_logger()

# song_key → 한국어 이름 매핑 (docs/domain-logic.md §곡 목록과 동기화 필요)
SONG_NAME_MAP = {
    "brahms": "브람스 자장가",
    "mozart": "모차르트 자장가",
    "schubert": "슈베르트 자장가",
    "twinkle": "반짝반짝 작은 별",
    "rockabye": "로커바이 베이비",
    "hush": "허쉬 리틀 베이비",
}


async def list_tracks(
    db: AsyncSession,
    user_id: uuid.UUID,
    last_checked_at: Optional[datetime] = None,
    include_presigned: bool = True,
) -> TracksListResponse:
    """
    유저 트랙 목록 조회.

    last_checked_at: 클라이언트가 마지막으로 홈을 확인한 시각 (ISO8601 쿼리 파라미터).
    - 이 시각 이후 completed된 트랙이 있으면 completed_since_last_check=True
    - 클라이언트는 이 플래그로 "새 자장가 완성!" 카드 노출 여부 결정

    include_presigned: completed 트랙에 presigned URL 포함 여부.
    - 홈 화면은 True (트랙 목록 탭 시 바로 재생 가능하도록)
    - 최적화 필요 시 False로 요청 후 재생 시점에 별도 조회 가능
    """
    result = await db.execute(
        select(GeneratedTrack)
        .where(
            GeneratedTrack.user_id == user_id,
            GeneratedTrack.status.in_(["completed", "pending", "processing", "failed"]),
        )
        .order_by(GeneratedTrack.created_at.desc())
        .limit(50)  # V1: 최대 50개 (무제한 저장 정책)
    )
    tracks = result.scalars().all()

    has_pending = any(t.status in ("pending", "processing") for t in tracks)

    completed_since_last_check = False
    if last_checked_at is not None:
        completed_since_last_check = any(
            t.status == "completed"
            and t.completed_at is not None
            and t.completed_at > last_checked_at
            for t in tracks
        )

    track_items = []
    for t in tracks:
        presigned_url = None
        if include_presigned and t.status == "completed" and t.s3_key:
            try:
                presigned_url = storage_service.generate_presigned_url(t.s3_key)
            except Exception as e:
                logger.error(
                    "tracks.presign.failed",
                    track_id=str(t.id),
                    error=str(e),
                )
                # presigned URL 실패해도 목록 자체는 반환 (url=null)

        track_items.append(
            TrackItem(
                id=str(t.id),
                job_id=str(t.job_id),
                song_key=t.song_key,
                song_name=SONG_NAME_MAP.get(t.song_key, t.song_key),
                status=t.status,
                presigned_url=presigned_url,
                created_at=t.created_at,
                completed_at=t.completed_at,
            )
        )

    logger.info(
        "tracks.list.fetched",
        user_id=str(user_id),
        count=len(track_items),
        has_pending=has_pending,
    )

    return TracksListResponse(
        tracks=track_items,
        has_pending=has_pending,
        completed_since_last_check=completed_since_last_check,
        total=len(track_items),
    )


async def delete_track(
    db: AsyncSession,
    user_id: uuid.UUID,
    track_id: uuid.UUID,
) -> None:
    """
    트랙 삭제 (S06 스와이프/롱탭 → 삭제 확인).
    S3 mp3 파일도 함께 삭제.
    pending/processing 트랙은 삭제 불가 (409 반환).
    """
    result = await db.execute(
        select(GeneratedTrack).where(
            GeneratedTrack.id == track_id,
            GeneratedTrack.user_id == user_id,
        )
    )
    track = result.scalar_one_or_none()

    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="트랙을 찾을 수 없어요."
        )

    if track.status in ("pending", "processing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="생성 중인 트랙은 삭제할 수 없어요. 생성이 완료된 후 삭제해주세요.",
        )

    # S3 mp3 삭제 (completed 트랙인 경우) — asyncio.to_thread로 블로킹 호출 래핑
    if track.s3_key:
        s3_key = track.s3_key

        def _s3_delete() -> None:
            s3_kwargs: dict = {
                "region_name": settings.S3_REGION,
                "aws_access_key_id": settings.S3_ACCESS_KEY,
                "aws_secret_access_key": settings.S3_SECRET_KEY,
            }
            if settings.S3_ENDPOINT_URL:
                s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
            s3 = boto3.client("s3", **s3_kwargs)
            s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)

        try:
            await asyncio.to_thread(_s3_delete)
            logger.info("tracks.s3.deleted", track_id=str(track_id), s3_key=s3_key)
        except Exception as e:
            logger.error("tracks.s3.delete.failed", track_id=str(track_id), error=str(e))
            # S3 삭제 실패해도 DB 레코드는 삭제 진행 (orphan 파일은 S3 lifecycle로 정리)

    await db.delete(track)
    await db.commit()

    logger.info("tracks.deleted", user_id=str(user_id), track_id=str(track_id))
