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
    # 라우터는 impl/02에서 추가
    return app


app = create_app()
