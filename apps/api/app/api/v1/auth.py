import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.core.db import get_db
from app.core.security import decode_token, get_current_user_id
from app.schemas.auth import (
    EmailSignupRequest, EmailLoginRequest, SocialAuthRequest,
    RefreshTokenRequest, AuthTokenResponse, UserResponse,
)
from app.services.social_auth import verify_apple_token, verify_google_token
from app.services.auth_service import (
    signup_email, login_email, auth_social, refresh_access_token, get_me_response,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# auto_error=False: Authorization 헤더 미제공 시 FastAPI 기본 403 대신
# 직접 401을 발생시키기 위해 수동 처리 경로를 택함.
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/signup/email", response_model=AuthTokenResponse, status_code=201)
async def email_signup(
    body: EmailSignupRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    """
    이메일 + 비밀번호 신규 가입.
    클라이언트는 사전에 S02 개인정보 동의를 완료한 상태여야 함.
    """
    return await signup_email(db, body.email, body.password, privacy_consent=True)


@router.post("/login/email", response_model=AuthTokenResponse)
async def email_login(
    body: EmailLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    return await login_email(db, body.email, body.password)


@router.post("/social", response_model=AuthTokenResponse)
async def social_auth(
    body: SocialAuthRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    # JWTError 단일 핸들러가 토큰 검증 실패 + 네트워크 오류(social_auth에서 래핑) 모두 커버
    try:
        if body.provider == "apple":
            user_info = await verify_apple_token(body.id_token)
        else:  # google
            user_info = await verify_google_token(body.id_token)
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail=f"소셜 인증에 실패했어요: {str(e)}")

    return await auth_social(
        db,
        provider=body.provider,
        provider_uid=user_info["provider_uid"],
        email=user_info["email"],
        privacy_consent=True,  # S02 동의 완료 후 진입
    )


@router.post("/refresh", response_model=AuthTokenResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthTokenResponse:
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise JWTError("invalid token type")
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰이 만료됐어요")
    return await refresh_access_token(db, user_id)


@router.get("/me", response_model=UserResponse)
async def get_me(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    # credentials가 None이면 헤더 자체 미제공 → 401 (auto_error=False 덕에 403 아님)
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        user_id = await get_current_user_id(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")

    return await get_me_response(db, uuid.UUID(user_id))
