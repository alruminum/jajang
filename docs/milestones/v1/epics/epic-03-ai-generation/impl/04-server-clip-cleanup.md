---
depth: std
---

# impl/04 — [Story 4 / #194] 서버: 녹음 클립 24h 자동 삭제 + Celery Beat clip_cleanup

**Epic**: 03 — DSP 음원 후처리 생성
**커버 스토리**: Story 4 (녹음 샘플 서버 자동 삭제 — 24h TTL)
**선행 조건**: impl/01 (Recording ORM), impl/02 (DSP task 가 schedule_delete_at 설정)
**예상 소요**: 2~3시간

> **[v1.3.1 신규]** 구 Epic 02 voice-samples 24h 삭제 로직 (`tasks/cleanup.py:cleanup_voice_samples`) 의 Recording 버전.
> **scope 분리**: impl/02 §6 에 `clip_cleanup_task` 코드는 *이미 작성됨*. 본 impl 은 그 task 를 **별도 파일로 분리** + S3 lifecycle rule + 클라이언트 임시 파일 정리 + 재시도 백오프 정책을 추가 명시.

---

## 1. 생성/수정 파일

```
apps/api/app/
├── tasks/
│   └── clip_cleanup.py                  [신규 — impl/02 §6 의 clip_cleanup_task 를 이 파일로 이동]
├── core/
│   ├── celery_app.py                    [수정 — include 에 app.tasks.clip_cleanup 추가]
│   └── celery_config.py                 [수정 — beat_schedule clip-cleanup-hourly 항목 task 명 정합]
└── services/
    └── storage_service.py               [현행 유지 — delete_object(s3_key) 재사용]

apps/mobile/src/
└── services/recording/
    └── localCleanup.ts                  [신규 — expo-file-system deleteAsync 헬퍼]

infra/
└── s3-lifecycle-rule.json               [신규 — recordings/ prefix 24h TTL (operator 설정용)]
```

> impl/02 §6 의 `clip_cleanup_task` 함수는 **선행 작업(impl/02) 산출물에서 제거** 하고 본 impl/04 의 `tasks/clip_cleanup.py` 로 이전. impl/02 의 `dsp_processing.py` 는 DSP task 만 보유.

---

## 2. 인터페이스

```python
# apps/api/app/tasks/clip_cleanup.py
@shared_task(name="tasks.clip_cleanup", bind=True, max_retries=2, default_retry_delay=300)
def clip_cleanup_task(self) -> dict:
    """
    1시간 주기. recordings.schedule_delete_at <= NOW() AND s3_key IS NOT NULL 인 row 의
    S3 객체를 삭제 후 s3_key=NULL.

    반환: {"deleted": int, "skipped": int, "errors": int}
    실패한 row 는 schedule_delete_at 유지 → 다음 주기 재시도 (자동 백업).
    """
```

```typescript
// apps/mobile/src/services/recording/localCleanup.ts
export async function deleteLocalClip(uri: string): Promise<void>;
//   업로드 성공 후 호출. expo-file-system deleteAsync(uri, { idempotent: true }).
//   파일 부재 시 silent (idempotent).
```

---

## 3. 의사코드

```python
# tasks/clip_cleanup.py
import structlog
from datetime import datetime, timezone
from celery import shared_task
from sqlalchemy import select, update

from app.core.db import SyncSessionLocal
from app.models.recording import Recording
from app.services.storage_service import delete_object

logger = structlog.get_logger()

BATCH_LIMIT = 500   # 1주기당 최대 처리 row (large delete storm 방지)


@shared_task(name="tasks.clip_cleanup", bind=True, max_retries=2, default_retry_delay=300)
def clip_cleanup_task(self):
    now = datetime.now(timezone.utc)
    deleted = skipped = errors = 0

    with SyncSessionLocal() as db:
        rows = db.execute(
            select(Recording)
            .where(
                Recording.schedule_delete_at <= now,
                Recording.s3_key.isnot(None),
            )
            .limit(BATCH_LIMIT)
        ).scalars().all()

        for rec in rows:
            s3_key = rec.s3_key
            try:
                delete_object(s3_key)
                db.execute(
                    update(Recording)
                    .where(Recording.id == rec.id)
                    .values(s3_key=None)
                )
                deleted += 1
                logger.info("clip.deleted", recording_id=str(rec.id), s3_key=s3_key)
            except Exception as e:
                errors += 1
                logger.warning("clip.delete_failed", recording_id=str(rec.id), error=str(e))
                # schedule_delete_at 유지 → 다음 주기 재시도

        db.commit()

    logger.info("clip_cleanup.summary", deleted=deleted, skipped=skipped, errors=errors)
    return {"deleted": deleted, "skipped": skipped, "errors": errors}
```

```typescript
// services/recording/localCleanup.ts
import * as FileSystem from "expo-file-system";

export async function deleteLocalClip(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // idempotent 옵션으로 부재 파일은 throw X, 다른 IO 에러만 도달
    console.warn("[localCleanup] failed", uri, e);
  }
}
```

S3 lifecycle rule (operator 가 AWS console / CLI 로 1회 적용):

```json
{
  "Rules": [
    {
      "ID": "recordings-24h-ttl",
      "Status": "Enabled",
      "Filter": { "Prefix": "recordings/" },
      "Expiration": { "Days": 1 }
    }
  ]
}
```

---

## 4. 결정 근거

### 이중 안전망 (Celery + S3 lifecycle)
- Celery Beat 가 1순위 (정확한 24h, structlog 추적 가능, `s3_key=NULL` 반영)
- S3 lifecycle 은 백업 (Celery 다운 시 24h ± 1day 안에 S3 만 자동 삭제, DB row 의 `s3_key` 는 NULL 안 됨 → orphan column. 다음 cleanup 주기 진입 시 `s3_key=NULL` 처리 — DELETE 호출은 실패하지만 idempotent)

### BATCH_LIMIT=500
한 task 가 너무 많은 S3 DELETE 동기 호출 시 `time_limit` 초과 위험. 500 row * 평균 100ms = 50초. Celery default `task_time_limit` 미설정 시 안전.

### 클라이언트 로컬 정리
업로드 직후 호출. 디바이스 저장소 회수 (PRD §F4 "원본 음성 24h 내 삭제" 의 클라이언트측 일부).

---

## 5. 다른 모듈 경계

- **impl/02 (`dsp_processing.py`)**: DSP 성공/실패 시 `recordings.schedule_delete_at = NOW() + 24h` set 책임. 본 impl 은 set 된 row 를 *수확* 만 함.
- **impl/03 (`api/v1/sessions.py`)**: `POST /sessions/{id}/recordings` 시점엔 `schedule_delete_at=NULL` (DSP 종료 전). 본 task scan 대상 X.
- **impl/02 §6 의 코드 이동**: `dsp_processing.py` 에서 `clip_cleanup_task` 정의 제거 → `tasks/clip_cleanup.py` 로 이전. import 경로 `tasks.clip_cleanup` 로 변경. `celery_app.include` 에 추가.

---

## 6. 수용 기준

- [ ] (TEST) `schedule_delete_at <= NOW()` + `s3_key IS NOT NULL` row → S3 삭제 + `s3_key=NULL`
- [ ] (TEST) `schedule_delete_at IS NULL` row → 변경 없음 (스캔 제외)
- [ ] (TEST) S3 DELETE 실패 row → `s3_key` 유지 + structlog `clip.delete_failed` + 다음 주기 재시도
- [ ] (TEST) BATCH_LIMIT 초과 row 존재 시 → 첫 500 row 만 처리 + 다음 주기 잔여 처리
- [ ] (MANUAL) S3 lifecycle rule `recordings-24h-ttl` 적용 확인 (`aws s3api get-bucket-lifecycle-configuration`)
- [ ] (TEST) `deleteLocalClip(uri)` — 존재 파일 삭제 / 부재 파일 silent / 권한 오류 console.warn
- [ ] (TEST) Celery Beat 1h schedule 트리거 정상 (`celery -A app.core.celery_app inspect scheduled`)
- [ ] (TEST) structlog `clip.deleted` 기록 (`recording_id`, `s3_key`, deleted_at 자동)

---

## 7. 주의사항

- impl/02 의 `dsp_processing.py` 에서 `clip_cleanup_task` 코드를 *반드시* 제거. 두 파일이 동일 `name="tasks.clip_cleanup"` 으로 등록되면 Celery 가 마지막 import 만 사용 (silent 무시) → 디버깅 비용 큼.
- `delete_object(s3_key)` 가 NoSuchKey 던지면 lifecycle rule 이 이미 삭제한 케이스 — `try/except` 에서 warning 으로 흡수 + DB `s3_key=NULL` 진행 (orphan column 정합).
- `BATCH_LIMIT=500` 도 부하 테스트 후 조정. M0 운영 데이터 기준 1h 당 평균 ~100 row 예상.

---

MODULE_PLAN_READY
