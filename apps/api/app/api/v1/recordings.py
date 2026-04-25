import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.recordings import (
    UploadCompleteRequest,
    UploadCompleteResponse,
    UploadInitRequest,
    UploadInitResponse,
)
from app.services.recording_service import complete_upload, init_upload

router = APIRouter(prefix="/recordings", tags=["recordings"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = structlog.get_logger()


def _require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """JWT 검증 공통 헬퍼 — user_id 반환."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


@router.post("/init", response_model=UploadInitResponse, status_code=201)
async def init_recording_upload(
    body: UploadInitRequest,
    user_id: str = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    녹음 파일 S3 업로드를 위한 presigned PUT URL 발급.
    song_key 유효성은 서비스 레이어에서 검증하지 않음 (impl/01 SONGS_BY_KEY 상수와 일치 여부는 클라이언트 보장).
    generations/init에서 횟수 체크하므로 이 엔드포인트는 횟수 무관.
    """
    return await init_upload(db, uuid.UUID(user_id), body)


@router.post("/{sample_id}/complete", response_model=UploadCompleteResponse)
async def complete_recording_upload(
    sample_id: str,
    body: UploadCompleteRequest,
    user_id: str = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    클라이언트 S3 업로드 완료 후 통보.
    클라이언트 1차 검증 메타(duration, rms_db, peak_count) 저장.
    서버 2차 품질 검증(SNR)은 별도 /recordings/{id}/validate 엔드포인트 (impl/03).
    """
    if body.sample_id != sample_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="sample_id 불일치"
        )
    return await complete_upload(
        db,
        user_id=uuid.UUID(user_id),
        sample_id=sample_id,
        duration_seconds=body.duration_seconds,
        rms_db=body.rms_db,
        peak_count=body.peak_count,
    )
