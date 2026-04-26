---
depth: simple
---
# impl — #94 sqlite:memory 환경 DB 테이블 미생성 수정 (no such table: users)

## 원인 분석

| # | 원인 | 증상 |
|---|---|---|
| 1 | `DATABASE_URL=sqlite+aiosqlite:///:memory:` — `:memory:` DB는 연결마다 별도 인스턴스. Alembic migration 적용 불가. | `users` 등 전체 테이블 부재 → SELECT부터 500 |
| 2 | `init_db()`는 `SELECT 1` 연결 검증만 수행. `create_all` 호출 없음. | 오류 미탐지 — 서버 기동 성공 후 실제 API 호출에서 500 |
| 3 | `:memory:` 특성상 worker 간 공유 불가 (Uvicorn reload 시에도 DB 초기화) | 테스트/재시작 때마다 모든 데이터 消滅 |

**결론**: 개발 환경(SQLite)에서는 Alembic 없이 `Base.metadata.create_all`로 테이블을 자동 생성해야 한다. PostgreSQL 운영 환경은 Alembic 그대로 유지.

---

## 수정 파일 목록

| 파일 | 수정 유형 | 핵심 변경 |
|---|---|---|
| `apps/api/app/core/config.py` | 필드 추가 | `AUTO_CREATE_TABLES: bool = False` |
| `apps/api/app/core/db.py` | 함수 추가 | `create_all_if_dev()` — SQLite 또는 `AUTO_CREATE_TABLES=True` 시 `create_all` |
| `apps/api/app/main.py` | lifespan 수정 | `init_db()` 호출 직후 `create_all_if_dev()` 호출 |
| `apps/api/.env` | 값 교체 | `:memory:` → 파일 기반 SQLite + `AUTO_CREATE_TABLES=true` 추가 |

---

## 파일별 상세 명세

### 1. `apps/api/app/core/config.py`

**변경 위치**: `Settings` 클래스의 `# Env` 블록 위 또는 아래

```python
# DB 자동 생성 (SQLite dev 환경 전용)
AUTO_CREATE_TABLES: bool = False   # True 시 startup에서 Base.metadata.create_all 실행
                                   # SQLite URL이면 자동 True 취급 (조건: url이 "sqlite"로 시작)
```

**선택 근거**: 기존 `MOCK_GPU`, `MOCK_GOOGLE_AUTH` 패턴과 동일 — bool 환경변수로 분기. `pydantic-settings`가 `"true"/"false"` 문자열 자동 파싱. PostgreSQL 환경에서는 `.env`에서 이 값을 설정하지 않으면 `False`(기본값)이므로 운영 영향 없음.

---

### 2. `apps/api/app/core/db.py`

**변경 위치**: `init_db()` 함수 아래에 신규 함수 추가

```python
async def create_all_if_dev() -> None:
    """
    SQLite 환경 또는 AUTO_CREATE_TABLES=True 일 때 Base.metadata.create_all 실행.

    조건:
      - settings.DATABASE_URL이 "sqlite"로 시작하는 경우 → 항상 실행
      - settings.AUTO_CREATE_TABLES is True → DB 종류 무관 실행 (QA 환경 등)
      - 그 외(PostgreSQL 운영 환경 AUTO_CREATE_TABLES=False) → 스킵

    모든 모델이 Base.metadata에 등록된 후 호출되어야 한다.
    호출 시점은 main.py lifespan에서 init_db() 직후 처리.
    """
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    if not (is_sqlite or settings.AUTO_CREATE_TABLES):
        return

    # 모든 모델을 import해야 Base.metadata에 테이블이 등록된다.
    # app.models.__init__가 전체 모델을 export하므로 단일 import로 충분.
    import app.models  # noqa: F401  — side-effect import (테이블 등록 목적)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

**Base import 주의**: `Base`는 이미 `app.core.db` 모듈 스코프에 정의되어 있으므로 별도 import 불필요. `app.models` import는 각 모델 클래스가 `Base`를 상속하는 시점에 `Base.metadata`에 테이블 매핑이 등록되는 SQLAlchemy 메커니즘을 활용한다.

**`import app.models` 순환 참조 검토**:
- `app.models.__init__` → `app.models.user` 등 → `app.core.db.Base` 참조
- `app.core.db` → (런타임에서) `app.models` 참조 (함수 내부 지연 import)
- 함수 내부 import이므로 모듈 로드 시점 순환 참조 없음. lifespan에서 호출될 때 `app.models`는 이미 로드 완료 상태.

---

### 3. `apps/api/app/main.py`

**변경 위치**: lifespan 함수의 `await init_db()` 바로 다음 줄

```python
from app.core.db import create_all_if_dev, init_db   # ← create_all_if_dev 추가

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("startup", env=settings.ENV)
    await init_db()
    await create_all_if_dev()          # ← 추가: SQLite dev 환경 테이블 자동 생성
    yield
    logger.info("shutdown")
```

**변경 근거**: `init_db()`가 연결 검증 후 `create_all_if_dev()`가 테이블 생성을 수행하도록 책임을 분리. `init_db()` 함수 자체를 수정하지 않아 PostgreSQL 운영 경로 변경 없음.

---

### 4. `apps/api/.env`

**변경 내용**:

```diff
-DATABASE_URL=sqlite+aiosqlite:///:memory:
+DATABASE_URL=sqlite+aiosqlite:///./jajang_dev.db
+AUTO_CREATE_TABLES=true
```

**`:memory:` → 파일 기반 변경 근거**:
- `:memory:` SQLite는 연결마다 독립 인스턴스. `create_all`을 동일 연결에서 실행해도 다른 요청의 세션이 다른 인스턴스를 바라봄.
- `aiosqlite`의 비동기 드라이버는 내부적으로 별도 스레드에서 연결을 관리하므로 `:memory:` 공유가 더욱 불안정.
- 파일 기반(`jajang_dev.db`)으로 변경 시 모든 연결이 동일 파일 공유, 서버 재시작 간 데이터도 유지.
- `.gitignore`에 `*.db` 추가 여부 확인 필요 (운영 데이터 커밋 방지).

**`AUTO_CREATE_TABLES=true` 추가 근거**:
- `DATABASE_URL`이 `sqlite`로 시작하면 `create_all_if_dev()`에서 자동 처리되지만, 명시적으로 `.env`에 선언해두면 의도가 명확하고 PostgreSQL로 전환 시 제거 대상임을 알 수 있음.

---

## 모델 등록 상태 검증

`app/models/__init__.py` 현재 export 목록:

| 모델 클래스 | 파일 | 테이블 |
|---|---|---|
| `User` | `user.py` | `users` |
| `VoiceSample` | `voice_sample.py` | `voice_samples` |
| `GeneratedTrack` | `generated_track.py` | `generated_tracks` |
| `GenerationCounter` | `generation_counter.py` | `generation_counters` |
| `Subscription` | `subscription.py` | `subscriptions` |
| `RewardedAdUsage` | `rewarded_ad_usage.py` | `rewarded_ad_usages` |
| `AuditLog` | `audit_log.py` | `audit_logs` |

`Base`는 `app.core.db`에서 정의, `app.models.base`에서 re-export. 모든 모델이 `app.models.__init__`에서 import되므로 `import app.models` 한 번으로 전체 테이블이 `Base.metadata`에 등록된다. 누락 모델 없음.

---

## 의존 관계 / 구현 순서

```
1. apps/api/app/core/config.py — AUTO_CREATE_TABLES 필드 추가
2. apps/api/app/core/db.py — create_all_if_dev() 함수 추가
   ↳ import 경로 확인: app.models → app.core.db 순환 없음 (지연 import)
3. apps/api/app/main.py — lifespan에서 create_all_if_dev() 호출 추가
4. apps/api/.env — DATABASE_URL 교체 + AUTO_CREATE_TABLES=true 추가
   ↳ 기존 jajang_dev.db 파일이 있으면 삭제 후 재생성 (스키마 충돌 방지)
```

---

## 검증 절차

```bash
# (0) 기존 dev DB 파일 제거 (첫 실행 또는 스키마 변경 시)
rm -f apps/api/jajang_dev.db

# (1) 서버 기동
cd apps/api
uvicorn app.main:app --reload --port 8000

# (2) DB 파일 생성 확인
ls -la apps/api/jajang_dev.db
# → 파일이 존재해야 함

# (3) 이메일 가입 — 201 기대
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@jajang.com","password":"Test1234"}'

# (4) Google mock 가입 — 201 기대 (MOCK_GOOGLE_AUTH=true 필요)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","id_token":"dev-mock"}'

# (5) 서버 재시작 후 기존 계정 로그인 확인 (파일 DB 영속성 검증)
# → 201 or 200 (기존 계정)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8000/api/v1/auth/signup/email \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@jajang.com","password":"Test1234"}'
# 이미 가입된 이메일 → 409 또는 동일 이메일 로그인 정책에 따라 응답
```

---

## 주의사항

1. **PostgreSQL 운영 환경 영향 없음**: `create_all_if_dev()`는 `DATABASE_URL`이 `sqlite`로 시작하지 않고 `AUTO_CREATE_TABLES=False`(기본값)이면 즉시 return. 운영 배포 파이프라인에 `AUTO_CREATE_TABLES` 환경변수가 없으면 자동으로 스킵.

2. **`.gitignore` 확인**: `apps/api/jajang_dev.db`가 커밋되지 않도록 `*.db` 또는 `jajang_dev.db`가 `.gitignore`에 등재되어 있어야 한다. 등재 안 되어 있으면 engineer가 `.gitignore`에 추가.

3. **`create_all`은 기존 테이블을 수정하지 않음**: SQLAlchemy의 `create_all(checkfirst=True)`(기본값)는 테이블이 이미 존재하면 스킵. 따라서 서버를 재시작해도 기존 데이터 보존. 단, 컬럼 추가/변경은 반영 안 됨 — 스키마 변경 시 `jajang_dev.db` 삭제 후 재생성 필요.

4. **`import app.models` 위치**: `create_all_if_dev()` 함수 내부에 둔다. 모듈 레벨에 두면 `app.core.db` 로드 시 `app.models`를 즉시 로드하려 하고, `app.models`는 `app.core.db.Base`를 import하므로 순환 참조 에러. 함수 내부 import는 lifespan 실행 시점(앱 완전 로드 후)에 호출되므로 안전.

5. **Celery worker 별도 기동 시**: Celery worker가 SQLite 파일 DB를 공유하므로 동일 `jajang_dev.db`를 바라본다. worker 기동 전 API 서버가 먼저 기동되어 `create_all`이 완료된 상태여야 한다. 순서: API 서버 → Celery worker 기동.
