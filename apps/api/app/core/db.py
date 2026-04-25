from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

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


async def init_db() -> None:
    """앱 시작 시 연결 검증 (마이그레이션은 Alembic이 담당)"""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
