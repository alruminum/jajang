from contextlib import asynccontextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENV == "development",
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:  # type: ignore[return]
    async with AsyncSessionLocal() as session:
        yield session


@asynccontextmanager
async def get_db_session() -> AsyncSession:  # type: ignore[return]
    """Celery task 등 FastAPI DI 외부에서 DB 세션이 필요할 때 사용하는 컨텍스트 매니저."""
    async with AsyncSessionLocal() as session:
        yield session


# ── Celery task용 동기 세션 ──────────────────────────────────────────────────
# FastAPI 라우터는 get_db() (async) 사용. SyncSessionLocal은 Celery task 전용.
_sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")
_sync_engine_kwargs = (
    {} if _sync_url.startswith("sqlite") else {"pool_size": 5, "max_overflow": 2}
)
_sync_engine = create_engine(_sync_url, **_sync_engine_kwargs)
SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)


async def init_db() -> None:
    """앱 시작 시 연결 검증 (마이그레이션은 Alembic이 담당)"""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))


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
