import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models.voice_sample import VoiceSample
from app.schemas.generations import (
    CounterStatusResponse,
    GenerationInitRequest,
    GenerationInitResponse,
    GenerationStatusResponse,
)
from app.services.counter_service import check_and_reserve, get_counter_status
from app.services.generation_service import get_generation_status
from app.tasks.generation import generate_track_task

router = APIRouter(prefix="/generations", tags=["generations"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = structlog.get_logger()


def _require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """JWT 검증 → {"sub": user_id, "entitlement": "free"|"trial"|"premium"} 반환"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return {
            "sub": payload["sub"],
            "entitlement": payload.get("entitlement", "free"),
        }
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


# 주의: /counter/me 는 /{job_id} 보다 먼저 등록해야 함
# 순서가 바뀌면 "counter"가 job_id 파라미터로 인식됨
@router.get("/counter/me", response_model=CounterStatusResponse)
async def get_my_counter(
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    현재 유저 생성 횟수 조회.
    클라이언트: S07/S08/S10 화면 진입 시 호출해 "생성 N/3" UI 동기화.
    """
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]
    counter_data = await get_counter_status(db, user_id, entitlement)
    return CounterStatusResponse(**counter_data)


@router.post("/init", response_model=GenerationInitResponse, status_code=201)
async def init_generation(
    body: GenerationInitRequest,
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    생성 잡 등록.
    1. 횟수 체크 + 멱등성 확인 (impl/02 CounterService)
    2. GeneratedTrack 생성 (status='pending')
    3. Celery task 큐 등록

    멱등 재시도: 동일 job_id 재요청 시 is_new=False + 기존 상태 반환.
    Celery task는 is_new=True인 경우에만 큐에 등록.
    """
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]

    # ── 카운터 체크 + 멱등성 처리 ────────────────────────────────
    init_result = await check_and_reserve(db, user_id, entitlement, body)

    if not init_result.is_new:
        # 기존 job_id → Celery 재큐 없이 현재 상태만 반환
        logger.info(
            "generation.init.idempotent",
            user_id=str(user_id),
            job_id=str(body.job_id),
            status=init_result.status,
        )
        return init_result

    # ── voice_sample의 s3_key 조회 (Celery task에 전달) ──────────
    sample_result = await db.execute(
        select(VoiceSample).where(VoiceSample.id == body.voice_sample_id)
    )
    sample = sample_result.scalar_one_or_none()
    if sample is None or not sample.s3_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="녹음 파일 정보를 찾을 수 없어요.",
        )

    # ── Celery task 큐 등록 ──────────────────────────────────────
    generate_track_task.delay(
        track_id=init_result.track_id,
        job_id=str(body.job_id),
        user_id=str(user_id),
        entitlement=entitlement,
        voice_sample_id=str(body.voice_sample_id),
        song_key=body.song_key,
        s3_sample_key=sample.s3_key,
    )

    logger.info(
        "generation.init.queued",
        user_id=str(user_id),
        job_id=str(body.job_id),
        track_id=init_result.track_id,
    )

    return init_result


@router.get("/{job_id}", response_model=GenerationStatusResponse)
async def get_generation(
    job_id: str,
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    생성 상태 폴링.
    클라이언트: 5초 간격 polling (S12 화면).
    completed 시 presigned URL 포함 반환.
    """
    user_id = uuid.UUID(auth["sub"])
    return await get_generation_status(db, user_id, uuid.UUID(job_id))
