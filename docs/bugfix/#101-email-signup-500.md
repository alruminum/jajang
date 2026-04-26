---
depth: deep
---

# impl: 이메일 가입 500 — bcrypt 4.x / passlib 호환성 파괴 수정

**Issue**: #101  
**Labels**: bug, v01  
**심각도**: HIGH (신규 유저 가입 완전 차단)

---

## 근본 원인 확정

**후보 1 — passlib + bcrypt 4.x 호환성 파괴 (최유력)**

`pyproject.toml`에 `"passlib[bcrypt]>=1.7.4"` 상한 핀이 없으므로 bcrypt 4.0.0+가 설치될 수 있다.  
bcrypt 4.x는 내부 `__about__` 모듈을 제거했고, passlib 1.7.4는 이를 의존해 `AttributeError` 또는 `TypeError`를 발생시킨다.  
호출 경로: `email_signup` → `signup_email` → `hash_password(password)` → `pwd_context.hash(plain)` → **500**  
Google 가입은 `hash_password`를 호출하지 않으므로 정상 동작함.

**결정: passlib 제거 → bcrypt 직접 사용**

passlib 프로젝트는 2022년 이후 사실상 비활성 상태(마지막 릴리즈 1.7.4, 2020년).  
bcrypt 4.x 호환 패치가 나올 가능성 없음. 상한 핀(`<4.0`)은 보안 업그레이드를 영구 차단하는 기술 부채.  
bcrypt 직접 API는 2줄이며 passlib 기능 중 프로젝트가 실제로 사용하는 것은 `hash` / `verify` 두 함수뿐 → passlib 완전 제거가 타당.

**후보 2 — aiosqlite 미선언**

Google 가입이 DB 쓰기를 성공하므로 aiosqlite는 설치돼 있음. 근본 원인 아님.  
단, `pyproject.toml` 미선언은 의존성 hygiene 문제 → dev deps에 추가.

**후보 3 — IntegrityError 미캐치**

신규 이메일 첫 요청에서도 500이 나므로 근본 원인 아님.  
단, race-condition 방어 관점에서 `flush()` IntegrityError → 409 처리 추가 (안전망).

---

## 수정 파일 목록

| 파일 | 변경 유형 | 내용 |
|---|---|---|
| `apps/api/pyproject.toml` | 의존성 변경 | passlib 제거, bcrypt>=4.0.0 직접 선언, aiosqlite dev dep 추가 |
| `apps/api/app/core/security.py` | 로직 교체 | passlib CryptContext 제거 → bcrypt 직접 hash/verify |
| `apps/api/app/services/auth_service.py` | 방어 코드 추가 | signup_email flush() try/except IntegrityError → 409 |
| `apps/api/tests/conftest.py` | fixture 추가 | `client: AsyncClient` pytest-asyncio fixture 신규 선언 |
| `apps/api/tests/test_auth_signup.py` | 신규 테스트 | signup 201, 중복 409, 비밀번호 해싱 단위 테스트 |

---

## 상세 구현

### 1. `apps/api/pyproject.toml`

```diff
-  "passlib[bcrypt]>=1.7.4",
+  "bcrypt>=4.0.0",
```

dev-dependencies에 추가:
```diff
+  "aiosqlite>=0.20.0",
```

**근거**: bcrypt 직접 선언으로 상한 없이 최신 버전 수용. aiosqlite는 sqlite+aiosqlite 개발 URL 사용 시 필수이며 현재 미선언 상태.

---

### 2. `apps/api/app/core/security.py`

**교체 전**:
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

**교체 후**:
```python
import bcrypt

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())
```

- `plain.encode()` → UTF-8 bytes (bcrypt 4.x 요구사항)
- `bcrypt.gensalt()` 기본 rounds=12 (passlib 기본값과 동일)
- `.decode()` → str 저장 (DB column `password_hash: str`)
- `verify`는 stored hash를 `.encode()`로 bytes 변환 후 전달

**주의**: `from passlib.context import CryptContext` 및 `pwd_context` 전역 변수 완전 제거.

---

### 3. `apps/api/app/services/auth_service.py`

`signup_email` 함수의 `db.flush()` 호출을 IntegrityError 방어로 감쌈:

```python
from sqlalchemy.exc import IntegrityError

# signup_email 내부 flush 부분
try:
    await db.flush()  # user.id 생성
except IntegrityError:
    await db.rollback()
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="이미 등록된 이메일이에요",
    )
```

**근거**: 애플리케이션 레벨 중복 체크(select → scalar_one_or_none) 이후 DB flush 전까지 race condition이 발생할 수 있음. DB unique constraint 위반 시 IntegrityError를 잡아 409 반환.

---

### 4. `apps/api/tests/conftest.py` (수정 — fixture 추가)

기존 파일의 환경변수 블록 **아래**에 다음 추가:

```python
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
)
from unittest.mock import AsyncMock, patch

from app.main import app
from app.core.db import get_db, Base


@pytest_asyncio.fixture
async def client():
    """
    인메모리 SQLite + ASGI transport 기반 통합 테스트용 AsyncClient.

    설계 결정:
    - sqlite+aiosqlite:///:memory: 독립 엔진 사용 → Postgres 불필요
    - get_db 의존성 오버라이드 → 각 테스트가 격리된 세션 획득
    - lifespan(init_db / create_all_if_dev)은 AsyncMock 패치
      → 실제 Postgres 연결 시도 차단, 대신 fixture 안에서 직접 create_all 실행
    - 테스트 종료 후 dependency_overrides 정리 + engine dispose
    """
    import app.models  # noqa: F401 — Base.metadata 테이블 등록 (side-effect import)

    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)

    # 테이블 생성 (lifespan 우회 대신 직접 실행)
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with TestSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # lifespan 안의 init_db / create_all_if_dev 가 Postgres를 시도하므로 no-op 패치
    with (
        patch("app.main.init_db", new_callable=AsyncMock),
        patch("app.main.create_all_if_dev", new_callable=AsyncMock),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            yield ac

    app.dependency_overrides.pop(get_db, None)
    await test_engine.dispose()
```

**근거**:
- `asyncio_mode = "auto"` 설정(`pyproject.toml`)이 있으므로 `@pytest.mark.asyncio` 없이도 동작하나,
  `@pytest_asyncio.fixture`는 async fixture에 **반드시** 필요 (`@pytest.fixture`로 선언하면 async fixture가 제대로 await되지 않음).
- `patch("app.main.init_db", ...)` — lifespan은 `app.main`에서 import한 함수를 호출하므로 `app.main` 네임스페이스 기준으로 패치.
- `app.dependency_overrides.pop` cleanup — 테스트 간 오염 방지.

---

### 5. `apps/api/tests/test_auth_signup.py` (신규)

```python
"""
이메일 가입 엔드포인트 + 비밀번호 해싱 테스트
depth: deep (auth/암호화)
"""
import pytest
from httpx import AsyncClient
from app.core.security import hash_password, verify_password


# --- 단위: 비밀번호 해싱 ---

def test_hash_password_returns_string():
    hashed = hash_password("Test1234")
    assert isinstance(hashed, str)
    assert hashed != "Test1234"

def test_verify_password_correct():
    hashed = hash_password("Test1234")
    assert verify_password("Test1234", hashed) is True

def test_verify_password_wrong():
    hashed = hash_password("Test1234")
    assert verify_password("WrongPass", hashed) is False

def test_hash_password_unique_salts():
    h1 = hash_password("same")
    h2 = hash_password("same")
    assert h1 != h2  # 매번 다른 salt


# --- 통합: signup 엔드포인트 ---

@pytest.mark.asyncio
async def test_signup_email_201(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/signup/email",
        json={"email": "newuser@example.com", "password": "Test1234!"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body

@pytest.mark.asyncio
async def test_signup_email_duplicate_409(client: AsyncClient):
    payload = {"email": "dup@example.com", "password": "Test1234!"}
    await client.post("/api/v1/auth/signup/email", json=payload)
    resp = await client.post("/api/v1/auth/signup/email", json=payload)
    assert resp.status_code == 409
```

**주의**: `client` fixture는 이 impl의 §4에서 `tests/conftest.py`에 신규 추가하는 `AsyncClient` fixture. 반드시 conftest 수정이 선행되어야 함.

---

## 구현 순서

1. `pyproject.toml` 의존성 수정 → `uv sync` (또는 `pip install -e .`) 로 bcrypt 4.x + aiosqlite 재설치
2. `security.py` passlib 제거 + bcrypt 직접 구현
3. `auth_service.py` IntegrityError 방어 추가
4. `tests/conftest.py` — `client` fixture 추가 (기존 환경변수 블록 아래에 삽입)
5. `tests/test_auth_signup.py` 신규 작성
6. `pytest tests/test_auth_signup.py -v` 로 전체 테스트 통과 확인
7. curl 또는 통합 테스트로 `POST /api/v1/auth/signup/email` → 201 확인

---

## 주의사항 (경계)

- `hash_password` / `verify_password` 시그니처는 동일하게 유지 — `auth_service.py` 호출부 무변경
- `login_email`의 `verify_password` 호출도 동일 함수 사용 → 로그인도 함께 검증 필요
- 기존 DB에 passlib으로 해싱된 bcrypt 해시(`$2b$` prefix)는 bcrypt 직접 API로도 호환 가능 (`$2b$` 포맷 공통) → 마이그레이션 불필요
- `aiosqlite` dev dep 추가는 프로덕션 배포(Postgres+asyncpg 사용)에 영향 없음
