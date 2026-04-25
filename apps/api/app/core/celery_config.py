"""Celery Beat 스케줄 설정."""

from celery.schedules import crontab

# Task serialization
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]
timezone = "UTC"
enable_utc = True

beat_schedule = {
    "cleanup-voice-samples": {
        "task": "tasks.cleanup_voice_samples",
        "schedule": crontab(minute=0),  # 매 시각 정각 실행
    },
}
