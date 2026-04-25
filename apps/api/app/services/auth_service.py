import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.user import User
from app.models.subscription import Subscription
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
)
from app.schemas.auth import AuthTokenResponse, UserResponse


async def _get_entitlement(db: AsyncSession, user_id: uuid.UUID) -> str:
    """subscriptions 테이블에서 현재 entitlement 조회 (없으면 'free')"""
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return 'free'
    return sub.entitlement


async def _create_token_response(db: AsyncSession, user: User) -> AuthTokenResponse:
    entitlement = await _get_entitlement(db, user.id)
    return AuthTokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        entitlement=entitlement,
        user_id=str(user.id),
    )


async def get_me_response(db: AsyncSession, user_id: uuid.UUID) -> UserResponse:
    """/me 라우터 전용 — User + entitlement 결합 후 UserResponse 반환."""
    result = await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없어요")
    entitlement = await _get_entitlement(db, user.id)
    return UserResponse(
        id=str(user.id),
        email=user.email,
        provider=user.provider,
        entitlement=entitlement,
    )


async def signup_email(
    db: AsyncSession,
    email: str,
    password: str,
    privacy_consent: bool,
) -> AuthTokenResponse:
    # 중복 이메일 체크
    existing = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 등록된 이메일이에요",
        )

    user = User(
        email=email,
        password_hash=hash_password(password),
        provider="email",
        privacy_consent_given=privacy_consent,
        privacy_consent_at=datetime.now(timezone.utc) if privacy_consent else None,
    )
    db.add(user)
    await db.flush()  # user.id 생성 (트리거가 generation_counter 자동 생성)

    # subscriptions 초기 행 생성
    sub = Subscription(
        user_id=user.id,
        revenuecat_customer_id=str(user.id),
        entitlement="free",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(user)

    return await _create_token_response(db, user)


async def login_email(
    db: AsyncSession,
    email: str,
    password: str,
) -> AuthTokenResponse:
    result = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호를 확인해주세요",
        )
    return await _create_token_response(db, user)


async def auth_social(
    db: AsyncSession,
    provider: str,
    provider_uid: str,
    email: str | None,
    privacy_consent: bool = False,
) -> AuthTokenResponse:
    # 기존 계정 조회 (provider + provider_uid)
    result = await db.execute(
        select(User).where(
            User.provider == provider,
            User.provider_uid == provider_uid,
            User.deleted_at.is_(None),
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        # 신규 가입
        user = User(
            email=email,
            provider=provider,
            provider_uid=provider_uid,
            privacy_consent_given=privacy_consent,
            privacy_consent_at=datetime.now(timezone.utc) if privacy_consent else None,
        )
        db.add(user)
        await db.flush()

        sub = Subscription(
            user_id=user.id,
            revenuecat_customer_id=str(user.id),
            entitlement="free",
        )
        db.add(sub)
        await db.commit()
        await db.refresh(user)

    return await _create_token_response(db, user)


async def refresh_access_token(
    db: AsyncSession,
    user_id: str,
) -> AuthTokenResponse:
    result = await db.execute(
        select(User).where(User.id == uuid.UUID(user_id), User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없어요")
    return await _create_token_response(db, user)
