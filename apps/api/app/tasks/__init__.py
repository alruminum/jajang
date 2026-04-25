"""Celery tasks 패키지. cleanup task 등록."""

from app.tasks.cleanup import cleanup_voice_samples  # noqa: F401
