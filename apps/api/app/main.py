import pathlib
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.db import create_all_if_dev, init_db

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("startup", env=settings.ENV)
    await init_db()
    await create_all_if_dev()          # SQLite dev 환경 테이블 자동 생성
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
    from app.api.v1.auth import router as auth_router
    from app.api.v1.challenges import router as challenges_router
    from app.api.v1.generations import router as generations_router
    from app.api.v1.recordings import router as recordings_router
    from app.api.v1.rewarded import router as rewarded_router
    from app.api.v1.songs import router as songs_router
    from app.api.v1.tracks import router as tracks_router
    from app.api.v1.users import router as users_router
    from app.api.v1.webhooks import router as webhooks_router
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(challenges_router, prefix="/api/v1")
    app.include_router(generations_router, prefix="/api/v1")
    app.include_router(songs_router, prefix="/api/v1")
    app.include_router(recordings_router, prefix="/api/v1")
    app.include_router(rewarded_router, prefix="/api/v1")
    app.include_router(tracks_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(webhooks_router, prefix="/api/v1")
    # 로컬 개발 환경 정적 파일 서빙 (MOCK_S3=true 시 미리듣기 음원)
    _static_dir = pathlib.Path(__file__).parent.parent.parent / "static"
    if _static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
    return app


app = create_app()
