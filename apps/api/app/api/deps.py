"""공유 FastAPI 의존성 — 인증 등 라우터 간 공통 헬퍼."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.core.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """JWT 검증 공통 의존성 — user_id(sub) 반환."""
    return require_auth_with_entitlement(credentials)["sub"]


def require_auth_with_entitlement(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """JWT 검증 공통 의존성 — {"sub": user_id, "entitlement": ...} 반환."""
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
