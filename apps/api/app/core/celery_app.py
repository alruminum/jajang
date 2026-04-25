"""Celery 애플리케이션 인스턴스."""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "jajang",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.cleanup"],
)

celery_app.config_from_object("app.core.celery_config")
