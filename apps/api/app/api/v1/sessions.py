"""Server DSP path — sessions / recordings / masters / generate.

⚠️ MVP v1.4.x 부터 클라이언트 호출 0 (mobile local DSP path 채택, ADR-010).

코드/스키마/마이그레이션 보존 — 미래 sync 기능 진입 시 (다중 디바이스 동기화 /
가족 공유 등) 재활성화 가능. 신규 엔드포인트 = ``POST /sessions/{id}/upload-master``
(완성 wav 업로드용, 미구현 — 경로명만 박힘, ADR-19C).

자세히 = docs/epics/epic-19-local-dsp/adr.md ADR-19B.
"""

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth_with_entitlement
from app.core.db import get_db
from app.models.master_audio import MasterAudio
from app.models.recording import Recording
from app.models.recording_session import RecordingSession
from app.schemas.sessions import (
    RecordingRegisterRequest,
    RecordingRegisterResponse,
    SessionInitRequest,
    SessionInitResponse,
    SessionStatusResponse,
)
from app.services import storage_service
from app.services.session_service import init_session
from app.tasks.dsp_processing import dsp_process_task

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = structlog.get_logger()


@router.post("/init", response_model=SessionInitResponse, status_code=201)
async def session_init(
    body: SessionInitRequest,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]
    return await init_session(db, user_id, entitlement, body)


@router.post("/{session_id}/recordings", response_model=RecordingRegisterResponse, status_code=201)
async def register_recording(
    session_id: str,
    body: RecordingRegisterRequest,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """
    클립 S3 업로드 완료 후 Recording 등록.
    S3 존재 확인 후 INSERT. is_validated=True (서버 SNR 검증은 품질 체크 단계에서 이미 완료).
    """
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])

    # session 소유자 확인
    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    recording = Recording(
        session_id=_session_id,
        s3_key=body.s3_key,
        duration_ms=body.duration_ms,
        is_validated=True,
    )
    db.add(recording)
    await db.commit()

    return RecordingRegisterResponse(recording_id=str(recording.id))


@router.post("/{session_id}/generate", status_code=202)
async def generate(
    session_id: str,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """DSP Celery task dispatch."""
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]

    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    master_result = await db.execute(
        select(MasterAudio).where(MasterAudio.session_id == _session_id)
    )
    master = master_result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=500, detail="마스터 레코드가 없어요")

    # 이미 생성 중/완료면 중복 dispatch 방지
    if master.status in ("processing", "completed"):
        return JSONResponse(
            status_code=200,
            content={"message": "already processing or completed", "status": master.status},
        )

    await db.execute(
        update(RecordingSession)
        .where(RecordingSession.id == _session_id)
        .values(status="generating")
    )
    await db.commit()

    dsp_process_task.delay(
        session_id=str(_session_id),
        master_audio_id=str(master.id),
        user_id=str(user_id),
        entitlement=entitlement,
    )

    logger.info("session.generate.dispatched", session_id=session_id)
    return {"message": "queued", "session_id": session_id}


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: str,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])

    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    master_result = await db.execute(
        select(MasterAudio).where(MasterAudio.session_id == _session_id)
    )
    master = master_result.scalar_one_or_none()

    presigned_url = None
    if master and master.status == "completed" and master.s3_key:
        presigned_url = storage_service.generate_presigned_url(master.s3_key)

    return SessionStatusResponse(
        session_id=str(session.id),
        status=session.status,
        master_status=master.status if master else None,
        presigned_url=presigned_url,
        error_message=master.error_message if master else None,
    )
