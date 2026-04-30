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
    "hard-delete-expired-users": {
        "task": "tasks.hard_delete_expired_users",
        "schedule": crontab(hour=18, minute=0),  # 18:00 UTC = 03:00 KST
    },
    "clip-cleanup-hourly": {              # Recording S3 클립 24h TTL 삭제
        "task": "tasks.clip_cleanup",
        "schedule": 3600.0,              # 1시간 고정 주기
    },
}
