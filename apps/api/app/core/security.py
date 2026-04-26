from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

import bcrypt
from jose import jwt, JWTError
from app.core.config import settings

ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS
ALGORITHM = "RS256"
BCRYPT_MAX_BYTES = 72


def hash_password(plain: str) -> str:
    pw = plain.encode("utf-8")[:BCRYPT_MAX_BYTES]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    pw = plain.encode("utf-8")[:BCRYPT_MAX_BYTES]
    return bcrypt.checkpw(pw, hashed.encode("utf-8"))


def create_access_token(user_id: str, extra: dict[str, Any] | None = None) -> str:
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """
    raises: jose.JWTError (만료, 서명 오류 모두)
    """
    return jwt.decode(token, settings.JWT_PUBLIC_KEY, algorithms=[ALGORITHM])


async def get_current_user_id(token: str) -> str:
    """FastAPI Depends 용 — 라우터에서 Bearer 토큰 추출 후 호출"""
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise JWTError("invalid token type")
    return payload["sub"]
