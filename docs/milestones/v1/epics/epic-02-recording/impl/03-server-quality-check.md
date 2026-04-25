---
depth: std
design: skipped
---

# impl/03 — 서버: 품질 검증 서비스 + 24h 삭제 스케줄러

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 5 (서버 2차 품질 검증 — SNR), Story 5 (24h 삭제 스케줄러)  
**선행 조건**: impl/02 완료 (VoiceSample 모델, 업로드 API)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   └── recordings.py           [수정 — /validate 엔드포인트 추가]
├── schemas/
│   └── recordings.py           [수정 — ValidateResponse 추가]
├── services/
│   └── quality_check_service.py  [신규 — SNR 분석, 검증 로직]
├── tasks/
│   ├── __init__.py             [수정 — cleanup task 등록]
│   └── cleanup.py              [신규 — 24h 샘플 삭제 Celery task]
└── core/
    └── celery_config.py        [수정 — cleanup Beat schedule 추가]
```

---

## 2. 품질 검증 서비스

```python
# apps/api/app/services/quality_check_service.py

"""
서버 2차 품질 검증 — SNR 분석.
클라이언트 1차 검증(길이/RMS/클리핑)은 앱에서 이미 통과한 상태로 진입.
서버는 SNR(잡음비) 검증만 추가로 수행.

라이브러리: librosa (오디오 분석), numpy, boto3 (S3 다운로드)
의존성 추가 필요: librosa>=0.10, soundfile>=0.12 (apps/api/requirements.txt)
"""

import io
import asyncio
from datetime import datetime, timezone
from typing import Literal

import librosa
import numpy as np
import boto3
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.voice_sample import VoiceSample
from app.core.config import settings

logger = structlog.get_logger()

# 품질 기준 상수 (docs/voice-pipeline.md §4 기준)
SNR_THRESHOLD_DB = 15.0     # SNR 최소 기준

ValidationFailReason = Literal["snr_too_low", "sample_not_found", "s3_error", "analysis_error"]


def _compute_snr(audio_bytes: bytes) -> float:
    """
    librosa로 오디오 로드 후 RMS 기반 SNR 추정.
    음성 구간(상위 75%): 신호 / 배경 구간(하위 25%): 잡음으로 추정.
    알고리즘 상세 → docs/voice-pipeline.md §4.
    """
    y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)

    frame_length = int(0.025 * sr)   # 25ms 프레임
    hop_length   = int(0.010 * sr)   # 10ms 홉

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

    signal_rms = float(np.percentile(rms, 75))
    noise_rms  = float(np.percentile(rms, 25))

    snr_db = 20.0 * np.log10((signal_rms + 1e-10) / (noise_rms + 1e-10))
    return snr_db


async def _download_from_s3(s3_key: str) -> bytes:
    """S3/R2에서 샘플 다운로드 (asyncio executor로 boto3 동기 호출 래핑)."""
    def _sync_download():
        client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            **({"endpoint_url": settings.CLOUDFLARE_R2_ENDPOINT} if settings.CLOUDFLARE_R2_ENDPOINT else {}),
        )
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return response["Body"].read()

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_download)


class QualityCheckResult:
    def __init__(self, passed: bool, snr_db: float | None, fail_reason: ValidationFailReason | None = None):
        self.passed = passed
        self.snr_db = snr_db
        self.fail_reason = fail_reason


async def validate_sample(
    db: AsyncSession,
    sample_id: str,
    user_id: str,
) -> QualityCheckResult:
    """
    S3에서 샘플 다운로드 → SNR 분석 → DB 결과 기록.
    통과 시 status='validated', snr_db 기록.
    실패 시 status='uploaded' 유지 (재녹음 유도, 삭제는 클라이언트 요청 또는 24h 스케줄러).
    """
    from app.models.voice_sample import VoiceSample
    import uuid

    result = await db.execute(
        select(VoiceSample).where(
            VoiceSample.id == uuid.UUID(sample_id),
            VoiceSample.user_id == uuid.UUID(user_id),
            VoiceSample.deleted_at.is_(None),
        )
    )
    sample = result.scalar_one_or_none()
    if not sample:
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="sample_not_found")

    # S3 다운로드
    try:
        audio_bytes = await _download_from_s3(sample.s3_key)
    except Exception as e:
        logger.error("quality_check.s3_download.failed", sample_id=sample_id, error=str(e))
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="s3_error")

    # SNR 분석
    try:
        snr_db = _compute_snr(audio_bytes)
    except Exception as e:
        logger.error("quality_check.analysis.failed", sample_id=sample_id, error=str(e))
        return QualityCheckResult(passed=False, snr_db=None, fail_reason="analysis_error")

    passed = snr_db >= SNR_THRESHOLD_DB

    # DB 업데이트
    sample.snr_db = snr_db
    if passed:
        sample.status = "validated"
    # 실패 시 status='uploaded' 유지 — 재녹음 유도
    await db.commit()

    logger.info(
        "quality_check.completed",
        sample_id=sample_id,
        snr_db=round(snr_db, 2),
        passed=passed,
    )

    return QualityCheckResult(passed=passed, snr_db=snr_db)
```

---

## 3. 스키마 추가

```python
# apps/api/app/schemas/recordings.py 에 추가

from typing import Literal, Optional

class ValidateRequest(BaseModel):
    """현재 필드 없음 — sample_id는 URL path에서 추출."""
    pass

class ValidateResponse(BaseModel):
    sample_id: str
    passed: bool
    snr_db: Optional[float] = None
    fail_reason: Optional[str] = None
    message: str
```

---

## 4. 라우터 수정 (validate 엔드포인트 추가)

```python
# apps/api/app/api/v1/recordings.py 에 추가

from app.services.quality_check_service import validate_sample
from app.schemas.recordings import ValidateResponse

FAIL_MESSAGES = {
    "snr_too_low":      "조용한 공간에서 다시 녹음해주세요",
    "sample_not_found": "녹음 파일을 찾을 수 없어요",
    "s3_error":         "파일을 읽을 수 없어요. 잠시 후 다시 시도해주세요",
    "analysis_error":   "분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요",
}


@router.post("/{sample_id}/validate", response_model=ValidateResponse)
async def validate_recording(
    sample_id: str,
    user_id: str = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    서버 2차 품질 검증 (SNR).
    클라이언트가 /complete 호출 후 이 엔드포인트를 연이어 호출.
    통과 → passed=True, 다음 단계(generations/init) 진행 가능.
    실패 → passed=False + fail_reason + 재녹음 유도 메시지.
    """
    result = await validate_sample(db, sample_id=sample_id, user_id=user_id)

    message = "품질 확인이 완료됐어요." if result.passed else FAIL_MESSAGES.get(result.fail_reason or "", "다시 시도해주세요")

    return ValidateResponse(
        sample_id=sample_id,
        passed=result.passed,
        snr_db=result.snr_db,
        fail_reason=result.fail_reason,
        message=message,
    )
```

**URL 추가**: `POST /api/v1/recordings/{sample_id}/validate`

---

## 5. 24h 삭제 스케줄러

```python
# apps/api/app/tasks/cleanup.py

"""
목소리 샘플 24h 자동 삭제 스케줄러.
실행 주기: 매 시각 정각 (Celery Beat crontab).
설계 상세 → docs/voice-pipeline.md §6.
"""

import asyncio
from datetime import datetime, timezone

import boto3
import structlog
from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.db import get_db_session
from app.models.voice_sample import VoiceSample
from app.core.config import settings

logger = structlog.get_logger()

CLEANUP_BATCH_SIZE = 100   # 1회 실행당 최대 처리 건수


def _delete_s3_object(s3_key: str) -> None:
    """동기 S3 삭제 — Celery task 내부에서 직접 호출."""
    client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.CLOUDFLARE_R2_ENDPOINT} if settings.CLOUDFLARE_R2_ENDPOINT else {}),
    )
    client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)


@celery_app.task(name="tasks.cleanup_voice_samples", bind=True)
def cleanup_voice_samples(self):
    """
    schedule_delete_at <= NOW() 인 샘플 S3 삭제 + DB deleted_at 세팅.
    S3 삭제 실패 시 해당 레코드 스킵 — 다음 주기에 재시도.
    S3 lifecycle policy (2일 만료)가 백업으로 동작.
    """
    async def _run():
        async with get_db_session() as db:
            result = await db.execute(
                select(VoiceSample)
                .where(
                    VoiceSample.deleted_at.is_(None),
                    VoiceSample.schedule_delete_at <= datetime.now(timezone.utc),
                )
                .limit(CLEANUP_BATCH_SIZE)
            )
            samples = result.scalars().all()

            deleted_count = 0
            failed_count  = 0

            for sample in samples:
                try:
                    _delete_s3_object(sample.s3_key)
                    sample.deleted_at = datetime.now(timezone.utc)
                    sample.status = "deleted"
                    deleted_count += 1

                    logger.info(
                        "voice_sample_deleted",
                        user_id=str(sample.user_id),
                        sample_id=str(sample.id),
                        created_at=sample.created_at.isoformat(),
                        schedule_delete_at=sample.schedule_delete_at.isoformat(),
                        actual_deleted_at=datetime.now(timezone.utc).isoformat(),
                    )
                except Exception as e:
                    failed_count += 1
                    logger.error(
                        "voice_sample_delete_failed",
                        sample_id=str(sample.id),
                        s3_key=sample.s3_key,
                        error=str(e),
                    )
                    # schedule_delete_at 유지 → 다음 주기에 재시도

            await db.commit()
            logger.info(
                "cleanup.completed",
                deleted=deleted_count,
                failed=failed_count,
                total=len(samples),
            )

    asyncio.run(_run())
```

---

## 6. Celery Beat 스케줄 추가

```python
# apps/api/app/core/celery_config.py 에 추가

from celery.schedules import crontab

beat_schedule = {
    # 기존 항목 유지...
    "cleanup-voice-samples": {
        "task":     "tasks.cleanup_voice_samples",
        "schedule": crontab(minute=0),   # 매 시각 정각 실행
    },
}
```

---

## 7. requirements.txt 추가

```
# apps/api/requirements.txt 에 추가
librosa>=0.10.0
soundfile>=0.12.1
```

> **librosa 설치 주의**: `libsndfile` OS 시스템 의존성 필요.  
> Dockerfile: `RUN apt-get install -y libsndfile1`

---

## 8. 관찰가능성

```python
# 검증 완료 (SNR 포함)
logger.info("quality_check.completed", sample_id=..., snr_db=..., passed=...)

# S3 다운로드 실패
logger.error("quality_check.s3_download.failed", sample_id=..., error=...)

# 샘플 삭제 완료 (감사 로그)
logger.info("voice_sample_deleted", user_id=..., sample_id=..., ...)

# 삭제 실패 (S3 오류, 다음 주기 재시도)
logger.error("voice_sample_delete_failed", sample_id=..., s3_key=..., error=...)
```

Sentry: `analysis_error`, `s3_error`는 Sentry capture. `snr_too_low`는 정상 비즈니스 흐름 — capture 불필요.

---

## 9. 수용 기준

- [ ] `POST /api/v1/recordings/{id}/validate` — SNR ≥ 15dB 샘플 → passed=True + status='validated'
- [ ] `POST /api/v1/recordings/{id}/validate` — SNR < 15dB 샘플 → passed=False + "조용한 공간에서 다시 녹음해주세요"
- [ ] `POST /api/v1/recordings/{id}/validate` — 다른 유저 sample_id → passed=False, fail_reason='sample_not_found'
- [ ] DB voice_samples.snr_db 필드 저장 확인 (검증 후)
- [ ] Celery Beat `cleanup_voice_samples` 태스크 등록 확인 (`celery beat -A app.core.celery_app inspect scheduled`)
- [ ] schedule_delete_at 지난 샘플 → S3 삭제 + deleted_at 세팅 확인 (mock S3 환경)
- [ ] S3 삭제 실패 샘플 → schedule_delete_at 유지 (다음 주기 재시도)

---

## 10. 주의사항

- `validate_sample`은 CPU 집약적 연산(librosa)을 포함한다. 동시 요청 수가 많으면 FastAPI 비동기 루프를 블로킹할 수 있다. V1 트래픽(소규모)에서는 `run_in_executor`로 충분. V2 트래픽 증가 시 Celery worker로 분리 권장.
- librosa `load(sr=None)`: 원본 샘플레이트 유지. 리샘플링 없이 분석 → 정확도 유지 + 처리 시간 단축.
- `_compute_snr` 알고리즘(상위 75%/하위 25% RMS 분리)은 단순 추정이다. 무음 구간이 긴 샘플에서 과추정 가능. V1 기준(SNR 15dB)은 명백한 잡음 샘플 차단 목적 — 정밀 측정보다 실용적 임계값.
- 삭제 스케줄러 `CLEANUP_BATCH_SIZE=100`: 1시간마다 최대 100건 처리. 가입 초기 트래픽에서 충분. 누적 대기가 100건 초과하면 다음 주기에 이어서 처리(자동 backfill).
- `schedule_delete_at` 세팅 위치: impl/02 recordings/complete 엔드포인트가 아니라, Epic 03 `on_generation_success` 콜백에서 세팅 (생성 완료 시점에 24h 타이머 시작). 이 impl/03은 세팅 로직을 건드리지 않는다.
