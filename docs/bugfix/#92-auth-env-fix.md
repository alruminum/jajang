---
depth: std
---
# impl — #92 가입 경로 환경설정 결함 수정 (JWT dummy 키 / Google 401)

## 원인 분석

| # | 원인 | 증상 |
|---|---|---|
| 1 | `apps/api/.env`의 `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` = DUMMY 문자열 | `security.py`의 `jwt.encode()` 호출 시 python-jose가 PEM 파싱 실패 → 500 |
| 2 | `social_auth.py`의 `verify_google_token`이 항상 Google tokeninfo API 실호출 + `aud` 검증 시 `GOOGLE_CLIENT_ID=""` → 조건 불일치 | 401 `Invalid Google token` |
| 3 | `App.tsx:17` `GoogleSignin.configure({ webClientId: '' })` — 빈 client_id로 configure | native Google Sign-In 플레이 서비스 단에서 거부 (서버 도달 전) |

## 수정 파일 목록

| 파일 | 수정 유형 | 핵심 변경 |
|---|---|---|
| `apps/api/.env` | 교체 | 실제 RSA-2048 키 주입 + `MOCK_GOOGLE_AUTH=true` + `GOOGLE_CLIENT_ID=dev-mock` |
| `apps/api/app/core/config.py` | 필드 추가 | `MOCK_GOOGLE_AUTH: bool = False` |
| `apps/api/app/services/social_auth.py` | 로직 추가 | `verify_google_token` 진입부 mock 분기 |
| `apps/mobile/App.tsx` | 가드 추가 | `webClientId` 빈 문자열이면 `GoogleSignin.configure` 스킵 |
| `apps/mobile/src/components/SocialAuthButtons.tsx` | dev 분기 추가 | `__DEV__ && !webClientId` 시 mock id_token으로 직접 서버 호출 |

---

## 파일별 상세 명세

### 1. `apps/api/.env`

**변경 이유**: DUMMY PEM은 `python-jose`의 RSA 키 파싱(`rsa.import_key`)을 통과하지 못한다. 개발 환경용 실제 RSA-2048 키 페어가 필요하다.

**적용 방법** (서버 최초 설정 시 1회 실행):

```bash
# 프라이빗 키 생성
openssl genpkey -algorithm RSA -out /tmp/jwt-priv.pem -pkeyopt rsa_keygen_bits:2048

# 퍼블릭 키 추출
openssl rsa -pubout -in /tmp/jwt-priv.pem -out /tmp/jwt-pub.pem
```

`.env` 작성 규칙: PEM 개행을 `\n`으로 escape하여 단일 행으로 표현.

```
# .env 예시 (개발 전용 — git commit 금지)
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n<base64 줄들>\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n<base64 줄들>\n-----END PUBLIC KEY-----"
MOCK_GOOGLE_AUTH=true
GOOGLE_CLIENT_ID=dev-mock
```

> **주의**: 프로덕션 키와 분리. `.env`는 `.gitignore` 등재 필수 (이미 등재 여부 확인).

**python-jose 개행 처리 주의사항**: `pydantic-settings`는 `.env` 파일에서 `"..."` 큰따옴표 내 `\n`을 그대로 문자열로 읽는다. `python-jose`가 PEM을 파싱할 때 `\n`을 실제 newline으로 처리하므로 `.replace('\\n', '\n')`은 불필요하다. 단, 따옴표 없이 멀티라인으로 쓰면 `pydantic-settings`가 첫 줄만 읽으므로 **반드시 큰따옴표로 감싼다**.

---

### 2. `apps/api/app/core/config.py`

**변경 위치**: `Settings` 클래스 내 `# Social Auth` 블록 아래

```python
# Social Auth
GOOGLE_CLIENT_ID: str = ""
MOCK_GOOGLE_AUTH: bool = False   # ← 추가. true 시 Google tokeninfo 호출 스킵
```

**선택 근거**: 기존 `MOCK_GPU` 패턴과 동일 — bool 환경변수로 개발/운영 분기. `pydantic-settings`가 `"true"/"false"` 문자열을 자동 파싱.

---

### 3. `apps/api/app/services/social_auth.py`

**변경 위치**: `verify_google_token` 함수 진입부

```python
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

    # 기존 운영 로직 (변경 없음)
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

    if payload.get("aud") != GOOGLE_CLIENT_ID:
        raise JWTError("Invalid Google audience")

    return SocialUserInfo(
        provider_uid=payload["sub"],
        email=payload.get("email"),
    )
```

**경계**: mock 분기는 `settings.MOCK_GOOGLE_AUTH` 값에만 의존한다. `ENV` 값으로 분기하지 않는다 — staging에서 실제 Google 검증을 원할 때 `MOCK_GOOGLE_AUTH=false`만 설정하면 된다.

**보안 고려**: mock 분기에서 임의 문자열을 `provider_uid`로 수락하므로, `MOCK_GOOGLE_AUTH=true` 상태에서는 인증 우회가 가능하다. 따라서:
- 이 값은 개발/테스트 환경 `.env`에만 설정
- 프로덕션 배포 파이프라인에서 `MOCK_GOOGLE_AUTH`가 `true`인 경우 빌드를 차단하는 CI 검증 추가 권고

---

### 4. `apps/mobile/App.tsx`

**변경 위치**: 컴포넌트 외부 `GoogleSignin.configure` 호출부 (line 17~20)

```typescript
// webClientId가 설정된 경우에만 configure (빈 값으로 configure 시 Play Services 거부)
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
if (googleWebClientId) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    offlineAccess: false,
  });
}
```

**변경 근거**: `@react-native-google-signin/google-signin`은 빈 `webClientId`로 `configure`할 경우 `hasPlayServices()` 또는 `signIn()` 호출 시 내부 오류를 발생시킨다. configure 자체를 스킵하면 `SocialAuthButtons`의 mock 분기로 fallback 가능.

> **환경변수명 통일**: 기존 `App.tsx`에서 `process.env.GOOGLE_WEB_CLIENT_ID`로 읽던 것을 Expo 컨벤션에 맞게 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`로 변경한다. `app.config.ts` 및 `SocialAuthButtons.tsx`에서도 동일한 변수명을 참조한다.

---

### 5. `apps/mobile/src/components/SocialAuthButtons.tsx`

**변경 위치**: `handleGoogle` 함수

```typescript
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

const handleGoogle = async () => {
  try {
    // ── dev 환경 mock 분기 ──────────────────────────────────────────
    // webClientId 미설정(개발 환경) 시 native Google Sign-In 스킵.
    // MOCK_GOOGLE_AUTH=true 서버와 쌍으로 동작.
    // mock id_token 형식: "dev-mock-<email>" — 서버가 email로 파싱 가능.
    if (__DEV__ && !webClientId) {
      const mockToken = 'dev-mock-qa@jajang.com';
      onSuccess('google', mockToken);
      return;
    }
    // ──────────────────────────────────────────────────────────────────

    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    if (!userInfo.idToken) throw new Error('No id token');
    onSuccess('google', userInfo.idToken);
  } catch (e: any) {
    if (e.code === 12501) return;
    onError?.(e);
    Alert.alert('Google 로그인 실패', '다시 시도해주세요');
  }
};
```

**mock id_token 형식 선택 근거**:
- `"dev-mock-qa@jajang.com"` → 서버 mock 분기에서 `"@" in id_token` 조건으로 email 파싱 가능
- `provider_uid`로 동일한 값 사용 → 재실행 시 동일 계정으로 로그인 (멱등성)
- 프로덕션 빌드(`__DEV__ = false`)에서는 절대 이 블록에 진입하지 않음

---

## 의존 관계 / 구현 순서

```
1. apps/api/.env 교체 (RSA 키 + MOCK_GOOGLE_AUTH)
   → 서버 재시작 후 이메일 가입 500 해소 확인
2. apps/api/app/core/config.py MOCK_GOOGLE_AUTH 필드 추가
3. apps/api/app/services/social_auth.py mock 분기 추가
   → curl 검증 (2)번 통과 확인
4. apps/mobile/App.tsx webClientId 가드
5. apps/mobile/src/components/SocialAuthButtons.tsx dev mock 분기
   → 에뮬레이터에서 Google 버튼 탭 → 메인 화면 진입 확인
```

---

## 검증 절차

```bash
# 서버 기동 (apps/api/)
uvicorn app.main:app --reload --port 8000

# (1) 이메일 가입 — 201 기대
curl -s -o /tmp/r1.txt -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@jajang.com","password":"Test1234"}'
cat /tmp/r1.txt

# (2) Google mock 가입 — 201 기대
curl -s -o /tmp/r2.txt -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","id_token":"dev-mock-qa@jajang.com"}'
cat /tmp/r2.txt

# (3) 동일 mock 토큰 재호출 — 201 or 200 (기존 계정 로그인)
curl -s -o /tmp/r3.txt -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","id_token":"dev-mock-qa@jajang.com"}'
cat /tmp/r3.txt
```

에뮬레이터 검증:
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` 미설정 상태에서 Google 버튼 탭 → mock 분기로 서버 호출 → 메인 화면 진입
- 이메일 가입 → 입력 완료 → 메인 화면 진입

---

## 주의사항

1. **`.env` git 제외 확인**: `apps/api/.env.example`은 DUMMY 값 유지. 실제 `.env`는 `.gitignore`에서 제외되어야 한다.
2. **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` 환경변수명 변경**: `App.tsx` 기존 코드에서 `GOOGLE_WEB_CLIENT_ID`로 읽던 것을 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`로 통일. `app.config.ts`에 해당 변수가 expose되어 있는지 확인 필요.
3. **`MOCK_GOOGLE_AUTH` 프로덕션 차단**: CI 파이프라인에서 `grep 'MOCK_GOOGLE_AUTH=true' apps/api/.env` 후 배포 차단하는 lint 단계 추가 권고.
4. **SQLite 메모리 DB 한계**: 현재 `DATABASE_URL=sqlite+aiosqlite:///:memory:` — 서버 재시작 시 모든 데이터 초기화. 개발 중 데이터 유지가 필요하면 `sqlite+aiosqlite:///./dev.db`로 변경.
5. **`social_auth.py`의 모듈 레벨 `GOOGLE_CLIENT_ID = settings.GOOGLE_CLIENT_ID`**: 이 값은 모듈 로드 시 1회 고정된다. mock 분기에서는 이 값을 사용하지 않으므로 `.env`에서 `GOOGLE_CLIENT_ID=dev-mock`으로 설정해도 동작에 영향 없음.
