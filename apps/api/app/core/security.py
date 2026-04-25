# JWT 유틸리티 stub — impl/02에서 실제 구현
# python-jose RS256 기반 access/refresh token 발급·검증 예정

from datetime import datetime, timedelta
from typing import Any

from jose import jwt

from app.core.config import settings


def create_access_token(subject: str | Any) -> str:
    """RS256 access token 발급 (stub)"""
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm="RS256")


def create_refresh_token(subject: str | Any) -> str:
    """RS256 refresh token 발급 (stub)"""
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_PRIVATE_KEY, algorithm="RS256")


def decode_token(token: str) -> dict:
    """토큰 검증 및 payload 반환 (stub)"""
    return jwt.decode(token, settings.JWT_PUBLIC_KEY, algorithms=["RS256"])
