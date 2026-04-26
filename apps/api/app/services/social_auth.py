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
    # ── 개발 환경 mock 분기 ─────────────────────────────────────────
    # MOCK_GOOGLE_AUTH=true 일 때 Google API 호출 없이 id_token을 직접 사용.
    # id_token 값이 이메일 형식이면 email로, 아니면 provider_uid로만 사용.
    # 운영 환경(MOCK_GOOGLE_AUTH=false)에서는 이 블록에 진입하지 않는다.
    if settings.MOCK_GOOGLE_AUTH:
        uid = id_token  # 클라이언트가 전송한 값을 그대로 안정 식별자로 사용
        email = id_token if "@" in id_token else None
        return SocialUserInfo(provider_uid=uid, email=email)
    # ─────────────────────────────────────────────────────────────────

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
