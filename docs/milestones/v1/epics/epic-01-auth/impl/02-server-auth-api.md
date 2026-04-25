---
depth: deep
---

# impl/02 — FastAPI 인증 API (회원가입/로그인/소셜/JWT)

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 2 (이메일 가입), Story 3 (소셜 가입), Story 4 (로그인)  
**선행 조건**: impl/01 완료 (ORM 모델, DB 마이그레이션)  
**예상 소요**: 5~7시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── __init__.py             [수정 — router include]
│   └── auth.py                 [신규 — 인증 라우터]
├── schemas/
│   ├── __init__.py             [수정]
│   └── auth.py                 [신규 — Pydantic request/response]
├── services/
│   ├── __init__.py             [수정]
│   ├── auth_service.py         [신규 — 비즈니스 로직]
│   └── social_auth.py          [신규 — Apple/Google 토큰 검증]
├── core/
│   ├── config.py               [수정 — GOOGLE_CLIENT_ID 추가 (신규 필드 1개)]
│   └── security.py             [수정 — JWT 발급/검증 완성]
└── main.py                     [수정 — 라우터 등록]
```

> **config.py 필드 범위 확인**: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` 4개 필드는 impl/00 scaffold 단계에서 이미 추가 완료 (현재 `core/config.py` 확인). **이 impl/02에서 추가하는 필드는 `GOOGLE_CLIENT_ID` 1개뿐**.

---

## 2. Pydantic 스키마 인터페이스

### schemas/auth.py

```python
from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Literal
import re

# --- Request ---

class EmailSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @model_validator(mode='after')
    def validate_password_strength(self):
        pwd = self.password
        if not re.search(r'[A-Za-z]', pwd) or not re.search(r'\d', pwd):
            raise ValueError("비밀번호는 문자와 숫자를 모두 포함해야 해요")
        return self

class EmailLoginRequest(BaseModel):
    email: EmailStr
    password: str

class SocialAuthRequest(BaseModel):
    provider: Literal['apple', 'google']
    id_token: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# --- Response ---

class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    entitlement: Literal['free', 'trial', 'premium']
    user_id: str

class UserResponse(BaseModel):
    id: str
    email: str | None
    provider: str
    entitlement: Literal['free', 'trial', 'premium']
```

**비밀번호 강도 규칙**: PRD F1 명시 "8자 이상, 숫자+문자 조합". `model_validator`로 Pydantic 레이어에서 검증 — 라우터/서비스 레이어 중복 검증 불필요.

---

## 3. 핵심 로직: core/security.py (완성)

```python
from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = settings.REFRESH_TOKEN_EXPIRE_DAYS
ALGORITHM = "RS256"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
```

**RS256 채택 이유**: 비대칭키로 외부 마이크로서비스(향후)에서 public key만으로 검증 가능. 단일 서버인 V1에서도 private key 노출 없이 토큰 검증 분리.  
**refresh token 저장 전략**: V1에서는 refresh token을 DB에 저장하지 않음. 클라이언트 SecureStore 보관. 탈취 시나리오: access 1h + refresh 30d rotation. V2에서 server-side revocation 고려.  
**결정 기록**: refresh token 블랙리스트 DB를 V1에 넣지 않는 이유 — 1인 MVP 타임라인. 실제 탈취 시나리오 발생 가능성 낮음. 탈퇴 시 클라이언트 토큰 삭제로 완화.

---

## 4. 소셜 인증 서비스: services/social_auth.py

```python
import httpx
from jose import jwt as jose_jwt
from jose.exceptions import JWTError
from typing import TypedDict
from app.core.config import settings

class SocialUserInfo(TypedDict):
    provider_uid: str          # sub 클레임
    email: str | None

# --- Apple ---

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_AUDIENCE = "com.jajang.app"  # Bundle ID

async def verify_apple_token(id_token: str) -> SocialUserInfo:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            jwks_resp = await client.get(APPLE_JWKS_URL)
            jwks_resp.raise_for_status()
            jwks = jwks_resp.json()
    except httpx.TimeoutException as e:
        raise JWTError(f"Apple JWKS timeout: {e}") from e
    except httpx.HTTPError as e:
        raise JWTError(f"Apple JWKS network error: {e}") from e

    # kid 매칭 후 검증
    header = jose_jwt.get_unverified_header(id_token)
    key = next((k for k in jwks["keys"] if k["kid"] == header["kid"]), None)
    if not key:
        raise JWTError("Apple public key not found")

    payload = jose_jwt.decode(
        id_token,
        key,
        algorithms=["RS256"],
        audience=APPLE_AUDIENCE,
        issuer=APPLE_ISSUER,
    )
    return SocialUserInfo(provider_uid=payload["sub"], email=payload.get("email"))


# --- Google ---

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUER = ("https://accounts.google.com", "accounts.google.com")
GOOGLE_CLIENT_ID = settings.GOOGLE_CLIENT_ID  # .env: GOOGLE_CLIENT_ID=<OAuth 클라이언트 ID>

async def verify_google_token(id_token: str) -> SocialUserInfo:
    # Google은 tokeninfo endpoint로 간단 검증 (JWKS 대안)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": id_token},
            )
    except httpx.TimeoutException as e:
        raise JWTError(f"Google tokeninfo timeout: {e}") from e
    except httpx.HTTPError as e:
        raise JWTError(f"Google tokeninfo network error: {e}") from e

    if resp.status_code != 200:
        raise JWTError("Invalid Google token")
    payload = resp.json()

    if payload.get("iss") not in GOOGLE_ISSUER:
        raise JWTError("Invalid Google issuer")

    # aud 검증: 피싱 토큰(다른 앱 클라이언트 ID로 발급된 토큰) 차단
    if payload.get("aud") != GOOGLE_CLIENT_ID:
        raise JWTError("Invalid Google audience")

    return SocialUserInfo(
        provider_uid=payload["sub"],
        email=payload.get("email"),
    )
```

> **[F2 해결]** `httpx.TimeoutException`과 `httpx.HTTPError`(상위 클래스 — `ConnectError`, `ReadError` 등 포함)를 각 외부 호출 블록에서 캐치해 `JWTError`로 래핑. 라우터의 `except JWTError` 단일 핸들러가 네트워크 오류까지 401로 처리할 수 있게 전파 경로를 통일. Apple/Google 모두 동일 패턴 적용.

**Apple 검증 방식**: JWKS endpoint에서 public key 동적 조회 → jose로 검증. Apple은 id_token 최초 발급 시에만 email을 포함 — 이후 재로그인 시 email 없음. 따라서 DB에서 기존 계정 조회는 `provider_uid` 기준.  
**Google 검증 방식**: tokeninfo endpoint 활용. JWKS 직접 검증 대비 단순하지만 Google 서버 의존성 1회 추가. V1 단계에서는 구현 단순성 우선.  
**JWKS 캐싱**: V1에서 미적용. Apple/Google JWKS는 자주 바뀌지 않으나 요청마다 조회는 latency 추가. V2에서 TTL 캐시 도입 권고.

---

## 5. 인증 서비스 로직: services/auth_service.py

```python
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
    """[F2] /me 라우터 전용 public 함수 — User + entitlement 결합 후 UserResponse 반환.
    라우터에서 _get_entitlement private 함수를 직접 import하지 않도록 service 레이어가 제공."""
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

    # subscriptions 초기 행 생성 (RevenueCat customer_id는 impl/07에서 logIn 후 webhook으로 업데이트)
    sub = Subscription(
        user_id=user.id,
        revenuecat_customer_id=str(user.id),  # RevenueCat logIn(userId) 호출 시 customer_id = userId(UUID string)이므로 초기값도 동일하게 설정. webhook app_user_id와 일치.
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
            revenuecat_customer_id=str(user.id),  # § 11 확정 형식 — prefix 금지
            entitlement="free",
        )
        db.add(sub)
        await db.commit()
        await db.refresh(user)
    else:
        # 기존 계정 재로그인 — 업데이트 없음 (email은 최초 가입 값 유지)
        pass

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
```

---

## 6. 라우터: api/v1/auth.py

```python
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.auth import (
    EmailSignupRequest, EmailLoginRequest, SocialAuthRequest,
    RefreshTokenRequest, AuthTokenResponse, UserResponse,
)
from app.services.social_auth import verify_apple_token, verify_google_token
from app.services.auth_service import (
    signup_email, login_email, auth_social, refresh_access_token, get_me_response,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# [F1 해결] auto_error=False: Authorization 헤더 미제공 시 FastAPI 기본 403 대신
# 직접 401을 발생시키기 위해 수동 처리 경로를 택함. §8 에러 표준(401 = 인증 실패) 준수.
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/signup/email", response_model=AuthTokenResponse, status_code=201)
async def email_signup(
    body: EmailSignupRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    이메일 + 비밀번호 신규 가입.
    클라이언트는 사전에 S02 개인정보 동의를 완료한 상태여야 함.
    privacy_consent=True 를 body에 포함 (동의 화면에서 통과한 유저만 진입 가능).
    """
    return await signup_email(db, body.email, body.password, privacy_consent=True)


@router.post("/login/email", response_model=AuthTokenResponse)
async def email_login(
    body: EmailLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    return await login_email(db, body.email, body.password)


@router.post("/social", response_model=AuthTokenResponse)
async def social_auth(
    body: SocialAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    # JWTError 단일 핸들러가 토큰 검증 실패 + 네트워크 오류(§4에서 래핑) 모두 커버
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
):
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
):
    # [F1 해결] credentials가 None이면 헤더 자체 미제공 → 401 (auto_error=False 덕에 403 아님)
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        user_id = payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")

    # [W2 해결] UserResponse 스키마로 확정된 계약 반환
    # auth_service.get_me_response()로 위임 — 라우터에서 DB 조회·엔타이틀먼트 결합 로직 분리
    return await get_me_response(db, uuid.UUID(user_id))
```

> **[F1 해결]** `HTTPBearer(auto_error=False)` + `/me`에서 `credentials is None` 수동 체크로 Authorization 헤더 누락 시 403→401 전환. FastAPI 기본 HTTPBearer는 헤더 부재 시 403을 반환하는데, §8 스펙(401 = 인증 실패)과 불일치. auto_error=False 채택이 가장 침습적이지 않은 수정.  
> **[W2 해결]** `/me` `response_model=UserResponse` 확정. DB에서 User를 조회해 `id`, `email`, `provider`, `entitlement` 4개 필드를 반환. 클라이언트 계약이 명확해져 RN 앱 타입 생성 가능. `response_model=dict`는 OpenAPI spec에서 any-type으로 표기되어 계약 불명확.

---

## 7. main.py 수정 (라우터 등록)

```python
# apps/api/app/main.py 에 추가
from app.api.v1.auth import router as auth_router

app.include_router(auth_router, prefix="/api/v1")
```

**URL 패턴**: `/api/v1/auth/signup/email`, `/api/v1/auth/login/email`, `/api/v1/auth/social`, `/api/v1/auth/refresh`, `/api/v1/auth/me`

---

## 8. 에러 응답 표준

| HTTP 상태 | 사용 케이스 |
|---|---|
| 201 | 회원가입 성공 |
| 200 | 로그인/refresh 성공 |
| 400 | 요청 형식 오류 (Pydantic validation) |
| 401 | 잘못된 자격증명, 만료 토큰, **Authorization 헤더 미제공**, 소셜 인증 실패, **Apple/Google 네트워크 오류** |
| 409 | 이메일 중복 |
| 422 | Pydantic validation 상세 |

> **403 반환 금지**: FastAPI HTTPBearer 기본값은 헤더 부재 시 403 반환 — `auto_error=False`로 억제 후 401로 통일. 클라이언트는 4xx 분기를 401 단일 케이스로 처리 가능.

**에러 메시지 언어**: 한국어 (UX Flow 톤앤보이스 기준). 서버 에러 세부 정보는 `ENV=production`에서 노출 금지.

---

## 9. 관찰가능성 포인트

```python
# structlog 로깅 추가 위치
logger = structlog.get_logger()

# 회원가입 성공
logger.info("user.signup", provider="email", user_id=str(user.id))

# 소셜 인증 실패
logger.warning("social.auth.failed", provider=provider, error=str(e))

# 이메일 중복
logger.info("signup.conflict", email=email)
```

Sentry: 401/409는 정상 비즈니스 로직 — capture 불필요. 500은 Sentry capture.

---

## 10. 수용 기준

- [ ] `POST /api/v1/auth/signup/email` — 정상 가입 → 201 + access_token + refresh_token 반환
- [ ] 이메일 중복 가입 → 409 + 한국어 에러 메시지
- [ ] 비밀번호 8자 미만 → 422 Pydantic validation error
- [ ] `POST /api/v1/auth/login/email` — 올바른 자격증명 → 200 + token
- [ ] 잘못된 비밀번호 → 401 + "이메일 또는 비밀번호를 확인해주세요"
- [ ] `POST /api/v1/auth/social` — Apple id_token 검증 실패 → 401
- [ ] `POST /api/v1/auth/social` — Apple/Google JWKS 네트워크 오류(mock) → 401 (500 아님)
- [ ] `POST /api/v1/auth/refresh` — refresh_token으로 새 access_token 발급
- [ ] 만료된 refresh_token → 401
- [ ] `GET /api/v1/auth/me` — Authorization 헤더 미제공 → 401 (403 아님)
- [ ] `GET /api/v1/auth/me` — 유효한 access_token → 200 + `UserResponse` (id, email, provider, entitlement)
- [ ] `core/config.py`에 `GOOGLE_CLIENT_ID: str` 필드 존재 확인
- [ ] 신규 가입 후 `generation_counters` 행 존재 확인 (트리거)
- [ ] 신규 가입 후 `subscriptions` 행 `entitlement='free'` 확인

---

## 11. 주의사항

- `privacy_consent=True`를 API body에 포함하지 않은 경우의 처리: V1에서는 클라이언트가 S02 동의 후에만 가입 화면 진입 가능하므로 서버에서 별도 파라미터 검증 없이 `True` 고정. V2에서 동의 이력 감사(audit) 필요 시 body에 타임스탬프 추가.
- Apple Sign-in: email은 최초 가입 시에만 반환. 기존 Apple 계정 재로그인 시 `email=None`이 정상. `provider_uid`(sub)로 계정 식별.
- **[확정] `revenuecat_customer_id` 초기값 = `str(user.id)`**: RevenueCat SDK `logIn(userId)` 호출 시 customer_id가 `userId`(= UUID string)로 설정되고, Webhook `app_user_id`도 동일 UUID가 전달된다. `f"rc_{user.id}"` 같은 prefix 방식은 RevenueCat과 불일치를 유발하므로 사용 금지. `str(user.id)` 단일 형식으로 확정.
- **[확정] 소셜 JWKS/tokeninfo 네트워크 호출 타임아웃**: `httpx.AsyncClient(timeout=5.0)` 적용 완료. Apple/Google 외부 서비스 장애 시 auth 엔드포인트 blocking 방지.
- **[결정] 이메일 인증(이메일 발송) V1 scope-out**: 가입 직후 인증 메일 발송 기능은 V1에서 제외. 이유 — 1인 MVP 타임라인에서 SMTP/SES 인프라 설정 및 인증 토큰 DB 관리 비용이 핵심 플로우 구현 대비 ROI 낮음. 대안: 이메일 형식은 Pydantic `EmailStr`로 클라이언트 레이어에서 검증. V2에서 SES 연동 + `email_verified` 컬럼 추가 예정.
- **[결정] 비밀번호 찾기/재설정 V1 scope-out**: `POST /auth/password/reset` 엔드포인트는 V1에서 제외. 이유 — SMTP 인프라 + 재설정 토큰 만료 정책 + 이메일 검증 등 추가 작업이 1주 이상 소요되며 PRD 10~14주 타임라인 내 우선순위가 낮음. 유저는 **소셜 로그인(Apple/Google)** 으로 비밀번호 분실 시 우회 가능하다고 안내. V2 마일스톤에서 이메일 인증과 함께 묶어 구현 예정.
