import structlog
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.security import decode_token
from app.schemas.songs import PreviewUrlResponse, SongListResponse
from app.services.songs_service import get_all_songs, get_preview_url

router = APIRouter(prefix="/songs", tags=["songs"])
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


@router.get("", response_model=SongListResponse)
async def list_songs(user_id: str = Depends(_require_auth)):
    """
    자장가 6곡 목록 반환.
    인증 필요 (S07 화면은 로그인 후 진입).
    presigned URL 미포함 — 미리듣기는 /songs/{key}/preview 별도 호출.
    """
    logger.info("songs.list", user_id=user_id)
    return get_all_songs()


@router.get("/{song_key}/preview", response_model=PreviewUrlResponse)
async def get_song_preview(
    song_key: str,
    user_id: str = Depends(_require_auth),
):
    """
    미리듣기 30초 클립 presigned URL 발급.
    song_key 미존재 → 404.
    S3 오류 → 500.
    """
    try:
        result = get_preview_url(song_key)
        logger.info("songs.preview.issued", song_key=song_key, user_id=user_id)
        return result
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="존재하지 않는 곡이에요",
        )
    except ClientError as e:
        logger.error("s3.presign.failed", song_key=song_key, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요",
        )
