"""공유 FastAPI 의존성 — 인증 등 라우터 간 공통 헬퍼."""

import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_token
from app.models.subscription import Subscription
from app.services.entitlement_service import evaluate_entitlement

bearer_scheme = HTTPBearer(auto_error=False)


async def _verify_jwt(request: Request) -> dict:
    """Authorization 헤더에서 Bearer 토큰을 추출·검증하고 payload 반환."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    token = authorization[len("Bearer "):]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """JWT 검증 공통 의존성 — user_id(sub) 반환."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


async def require_auth_with_entitlement(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    JWT 검증 + Subscription/Trial 평가 → dict.
    반환: {"sub": user_id, "email": ..., "entitlement": "free"|"trial"|"premium"}
    """
    payload = await _verify_jwt(request)
    user_id = uuid.UUID(payload["sub"])

    sub = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
    ).scalar_one_or_none()

    is_active = sub.is_active if sub else False
    trial_expires = sub.trial_expires_at if sub else None
    entitlement = evaluate_entitlement(is_active, trial_expires, datetime.now(timezone.utc))

    return {
        "sub": str(user_id),
        "email": payload.get("email"),
        "entitlement": entitlement,
    }
