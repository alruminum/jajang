from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
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
    from app.api.v1.auth import router as auth_router
    from app.api.v1.recordings import router as recordings_router
    from app.api.v1.songs import router as songs_router
    from app.api.v1.webhooks import router as webhooks_router
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(songs_router, prefix="/api/v1")
    app.include_router(recordings_router, prefix="/api/v1")
    app.include_router(webhooks_router, prefix="/api/v1")
    return app


app = create_app()
