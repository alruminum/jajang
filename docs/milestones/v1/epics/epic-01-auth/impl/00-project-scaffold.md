---
depth: std
---

# impl/00 — 프로젝트 스캐폴드 (모노레포 초기 구조)

**Epic**: 01 — 인증 & 온보딩  
**선행 조건**: 없음 (첫 번째 impl)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
jajang/                              ← 프로젝트 루트 (이미 존재)
├── apps/
│   ├── mobile/                      ← React Native + Expo Bare
│   │   ├── package.json             [신규]
│   │   ├── app.json                 [신규]
│   │   ├── tsconfig.json            [신규]
│   │   ├── babel.config.js          [신규]
│   │   ├── metro.config.js          [신규]
│   │   ├── index.js                 [신규] (Expo entry)
│   │   ├── App.tsx                  [신규] (최소 provider 골격)
│   │   ├── .env.example             [신규]
│   │   └── src/
│   │       ├── screens/             [디렉토리 생성 — placeholder 없음, impl/03에서 추가]
│   │       ├── components/          [디렉토리 생성]
│   │       ├── store/               [디렉토리 생성]
│   │       ├── services/            [디렉토리 생성]
│   │       ├── audio/               [디렉토리 생성]
│   │       ├── navigation/          [디렉토리 생성]
│   │       ├── hooks/               [디렉토리 생성]
│   │       └── types/               [디렉토리 생성]
│   │           └── index.ts         [신규] (공용 타입 exports)
│   └── api/                         ← FastAPI 백엔드
│       ├── pyproject.toml           [신규]
│       ├── app/
│       │   ├── __init__.py          [신규]
│       │   ├── main.py              [신규] (FastAPI app factory)
│       │   ├── core/
│       │   │   ├── __init__.py      [신규]
│       │   │   ├── config.py        [신규] (pydantic-settings)
│       │   │   ├── security.py      [신규] (JWT stub)
│       │   │   └── db.py            [신규] (async session)
│       │   ├── api/
│       │   │   ├── __init__.py      [신규]
│       │   │   └── v1/
│       │   │       └── __init__.py  [신규]
│       │   ├── models/
│       │   │   └── __init__.py      [신규]
│       │   ├── schemas/
│       │   │   └── __init__.py      [신규]
│       │   ├── services/
│       │   │   └── __init__.py      [신규]
│       │   └── tasks/
│       │       └── __init__.py      [신규]
│       ├── alembic/
│       │   ├── env.py               [신규] (async-aware Alembic env)
│       │   ├── script.py.mako       [신규]
│       │   └── versions/            [디렉토리]
│       ├── alembic.ini              [신규]
│       └── .env.example             [신규]
├── .gitignore                       [수정 — 모노레포 패턴 추가]
└── package.json                     [신규 — 루트 workspaces (선택)]
```

---

## 2. 구조 선택 근거

### 모노레포 레이아웃: `apps/` vs `src/`

요청 문서에 `src/app/` + `src/server/` + `src/shared/` 구조를 제안했으나, 아래 이유로 `apps/mobile/` + `apps/api/` 로 조정:

| 항목 | `src/` 단일 루트 | `apps/` 분리 (채택) |
|---|---|---|
| Python 도구 인식 | pyproject.toml 위치 불명확 | `apps/api/pyproject.toml` — Python 표준 |
| Expo 기대 경로 | `src/app/app.json` — Expo CLI가 기대하지 않음 | `apps/mobile/app.json` — Expo 표준 |
| IDE 지원 | Python/TS 혼재 루트로 타입체커 혼선 | workspace 경계 명확 |
| 확장성 | shared/ 추가 시 경로 충돌 가능 | `apps/shared/` 또는 `packages/` 로 자연 확장 |

**`shared/` 패키지 결정**: V1에서는 OpenAPI-generated 타입 공유 미도입. 서버 Pydantic → 클라이언트 수동 타입 유지. 공유 타입 자동생성은 TRD §1 기술 부채로 기록, V2 검토.

### 루트 package.json + workspaces

Yarn/npm workspaces는 선택적. V1에서는 루트 `package.json`에 `workspaces: ["apps/mobile"]` 선언만 해두고 실제 hoisting 활성화 여부는 `apps/mobile` 내에서 npm으로 독립 관리. 이유: Expo Bare + React Native는 hoisting 시 네이티브 모듈 경로 꼬임 이슈가 있으므로 분리 관리가 안전.

---

## 3. 핵심 파일 내용

### apps/mobile/package.json (핵심 의존성)

```json
{
  "name": "jajang-mobile",
  "version": "0.1.0",
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts,.tsx"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "react": "18.3.2",
    "react-native": "0.76.x",
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/native-stack": "^7.0.0",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "react-native-screens": "^4.0.0",
    "react-native-safe-area-context": "^4.12.0",
    "zustand": "^4.5.0",
    "react-native-track-player": "^4.1.0",
    "react-native-purchases": "^7.0.0",
    "react-native-google-mobile-ads": "^13.0.0",
    "@invertase/react-native-apple-authentication": "^2.3.0",
    "@react-native-google-signin/google-signin": "^13.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-av": "~15.0.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "typescript": "~5.3.0",
    "@types/react": "~18.3.0",
    "@types/react-native": "~0.76.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0"
  }
}
```

**버전 선택 근거**:
- Expo SDK 52: React Native 0.76 포함, React 18, New Architecture 선택적. Bare workflow 공식 지원.
- React Navigation v7: Stack + BottomTabs + `useNavigation` 타입 개선. v6 대비 `createNativeStackNavigator` 기본 분리.
- zustand v4: persist 미들웨어 내장, Immer 선택적.
- RNTP v4: React Native 0.73+ 공식 지원, iOS/Android 동일 API.

### apps/mobile/tsconfig.json

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@screens/*": ["src/screens/*"],
      "@components/*": ["src/components/*"],
      "@store/*": ["src/store/*"],
      "@services/*": ["src/services/*"],
      "@audio/*": ["src/audio/*"],
      "@navigation/*": ["src/navigation/*"],
      "@hooks/*": ["src/hooks/*"],
      "@types/*": ["src/types/*"]
    }
  }
}
```

**path alias 필수 이유**: Expo Bare에서 상대경로 depth 3+ 발생 빈번. babel-plugin-module-resolver와 짝을 이뤄야 함.

### apps/mobile/babel.config.js

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@screens': './src/screens',
            '@components': './src/components',
            '@store': './src/store',
            '@services': './src/services',
            '@audio': './src/audio',
            '@navigation': './src/navigation',
            '@hooks': './src/hooks',
            '@types': './src/types',
          },
        },
      ],
    ],
  };
};
```

`babel-plugin-module-resolver` 설치 필요: `npm install --save-dev babel-plugin-module-resolver`

### apps/mobile/App.tsx (골격)

```typescript
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// impl/03에서 NavigationContainer + RootNavigator 추가
// impl/07에서 Purchases.configure 추가
// impl/07에서 mobileAds().initialize() 추가

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* RootNavigator will be added in impl/03 */}
    </SafeAreaProvider>
  );
}
```

### apps/mobile/app.json (Expo config)

```json
{
  "expo": {
    "name": "자장",
    "slug": "jajang",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "jajang",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0D0F1A"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.jajang.app",
      "infoPlist": {
        "UIBackgroundModes": ["audio"],
        "NSMicrophoneUsageDescription": "자장가 녹음을 위해 마이크 접근이 필요해요",
        "NSPhotoLibraryUsageDescription": "프로필 이미지 설정에 사용됩니다"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0D0F1A"
      },
      "package": "com.jajang.app",
      "permissions": [
        "android.permission.RECORD_AUDIO",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
      ]
    },
    "plugins": [
      [
        "react-native-track-player",
        {
          "iosCapabilities": ["audio"]
        }
      ]
    ]
  }
}
```

**주의**: `userInterfaceStyle: "dark"` — UX Flow 다크 미드나이트 기조 강제. StatusBar는 항상 `light`.

---

## 4. FastAPI 서버 골격

### apps/api/pyproject.toml

```toml
[project]
name = "jajang-api"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.32.0",
  "sqlalchemy>=2.0.0",
  "asyncpg>=0.30.0",
  "alembic>=1.14.0",
  "pydantic>=2.9.0",
  "pydantic-settings>=2.6.0",
  "python-jose[cryptography]>=3.3.0",
  "passlib[bcrypt]>=1.7.4",
  "celery>=5.4.0",
  "redis>=5.2.0",
  "boto3>=1.35.0",
  "httpx>=0.27.0",
  "structlog>=24.4.0",
]

[tool.uv]
dev-dependencies = [
  "pytest>=8.3.0",
  "pytest-asyncio>=0.24.0",
  "httpx>=0.27.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

**uv 선택 이유**: pip/venv 대비 설치 속도 10~100x, lockfile 자동 생성, Python 버전 관리 통합. 1인 개발 환경 세팅 마찰 최소화.

### apps/api/app/core/config.py

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # DB
    DATABASE_URL: str
    REDIS_URL: str

    # JWT
    JWT_PRIVATE_KEY: str  # RS256 PEM
    JWT_PUBLIC_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Storage
    S3_BUCKET_NAME: str = "jajang-audio"
    S3_REGION: str = "ap-northeast-2"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_ENDPOINT_URL: str | None = None  # R2 선택 시

    # GPU (M0 이후 확정)
    MOCK_GPU: bool = True
    REPLICATE_API_TOKEN: str | None = None

    # Env
    ENV: str = "development"

settings = Settings()
```

### apps/api/app/main.py (골격)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import structlog

from app.core.db import init_db

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", env=settings.ENV)
    await init_db()
    yield
    logger.info("shutdown")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Jajang API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.ENV != "production" else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.ENV == "development" else [],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # 라우터는 impl/02에서 추가
    return app

app = create_app()
```

### apps/api/app/core/db.py (골격)

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.ENV == "development")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    """앱 시작 시 연결 검증 (마이그레이션은 Alembic이 담당)"""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
```

---

## 5. Alembic 설정

### apps/api/alembic.ini (핵심 부분)

```ini
[alembic]
script_location = alembic
sqlalchemy.url = driver://user:pass@localhost/dbname  # env.py에서 override

[loggers]
keys = root,sqlalchemy,alembic

[logger_root]
level = WARNING
```

### apps/api/alembic/env.py (async-aware)

```python
import asyncio
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.core.config import settings
from app.core.db import Base

# 모든 모델을 import해야 autogenerate 작동
import app.models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

def run_migrations_offline():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_migrations_online():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

**async-aware Alembic 이유**: SQLAlchemy 2.x async engine + asyncpg 조합 필수. 동기 env.py로는 `asyncpg`와 연결 불가.

---

## 6. .gitignore 추가 패턴

```gitignore
# React Native / Expo
apps/mobile/node_modules/
apps/mobile/.expo/
apps/mobile/ios/build/
apps/mobile/android/build/
apps/mobile/.env
apps/mobile/*.keystore

# Python / FastAPI
apps/api/.venv/
apps/api/__pycache__/
apps/api/**/__pycache__/
apps/api/.env
apps/api/*.egg-info/
apps/api/dist/

# 공통
.DS_Store
*.log
```

---

## 7. 환경변수 예시

### apps/mobile/.env.example

```bash
REVENUECAT_IOS_API_KEY=appl_xxxxxx
REVENUECAT_ANDROID_API_KEY=goog_xxxxxx
ADMOB_IOS_APP_ID=ca-app-pub-xxx~xxx
ADMOB_ANDROID_APP_ID=ca-app-pub-xxx~xxx
ADMOB_BANNER_UNIT_ID=ca-app-pub-xxx/xxx
ADMOB_REWARDED_UNIT_ID=ca-app-pub-xxx/xxx
GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
API_BASE_URL=http://localhost:8000
```

### apps/api/.env.example

```bash
DATABASE_URL=postgresql+asyncpg://jajang:jajang@localhost:5432/jajang
REDIS_URL=redis://localhost:6379/0
JWT_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...
S3_BUCKET_NAME=jajang-audio
S3_REGION=ap-northeast-2
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=...
MOCK_GPU=true
ENV=development
```

---

## 8. 수용 기준

- [ ] `cd apps/mobile && npm install` 에러 없이 완료
- [ ] `cd apps/mobile && npx expo start` 번들러 실행
- [ ] `cd apps/api && uv sync` 에러 없이 완료
- [ ] `cd apps/api && uvicorn app.main:app --reload` 서버 기동, `GET /docs` 200 응답
- [ ] `cd apps/api && alembic current` 실행 가능 (DB 연결 전제)
- [ ] TypeScript `tsc --noEmit` 에러 없음 (초기 골격 기준)

---

## 9. 주의사항 (다른 모듈 경계)

- `App.tsx`는 이 impl에서 최소 provider 골격만 작성. `NavigationContainer` 추가는 **impl/03** 담당.
- `Purchases.configure`, `mobileAds().initialize()` 초기화 코드는 **impl/07** 담당.
- `apps/api/app/models/` 디렉토리는 이 impl에서 `__init__.py`만 생성. 실제 ORM 모델 정의는 **impl/01** 담당.
- `alembic/versions/`는 이 impl에서 빈 디렉토리. 첫 마이그레이션 파일은 **impl/01** 담당.
- native 모듈(RNTP, RevenueCat, AdMob, Apple Auth, Google Sign-in)은 `npm install` 후 `npx expo prebuild` 또는 `npx expo run:ios`가 필요. 초기 scaffold에서는 `package.json` 선언까지만. 실제 네이티브 빌드 연동 검증은 impl/05 이후.
