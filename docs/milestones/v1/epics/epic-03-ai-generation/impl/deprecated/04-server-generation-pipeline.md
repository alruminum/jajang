---
depth: std
design: skipped
---

# impl/04 — 서버: 생성 파이프라인 (POST /generations + Celery task + GET /generations/{id})

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 2 (AI 생성 API 연동 — 엔드포인트 + 비동기 처리), Story 3 (생성 실패 처리), Story 4 (목소리 샘플 서버 자동 삭제)  
**선행 조건**: impl/01 (GeneratedTrack ORM), impl/02 (CounterService), impl/03 (VoiceInferenceClient + StorageService)  
**예상 소요**: 5~6시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── __init__.py                   [수정 — generations router include]
│   └── generations.py                [신규 — 생성 라우터]
├── tasks/
│   └── generation.py                 [신규 — Celery 생성 task]
└── services/
    └── generation_service.py         [신규 — 상태 조회, presigned URL 발급]
```

---

## 2. Celery 생성 Task

```python
# apps/api/app/tasks/generation.py

import uuid
import time
import structlog
from datetime import datetime, timezone, timedelta
from celery import shared_task
from celery.utils.log import get_task_logger

from app.core.db import SyncSessionLocal    # Celery task는 sync session 사용
from app.models.generated_track import GeneratedTrack
from app.models.voice_sample import VoiceSample
from app.services.inference.factory import get_inference_client
from app.services.inference.base import InferenceInput
from app.services import storage_service
from app.services.counter_service import increment_on_success
from sqlalchemy import select, update

logger = structlog.get_logger()
task_logger = get_task_logger(__name__)

SAMPLE_DELETE_DELAY_HOURS = 24     # Story 4: 샘플 삭제 예약 시간
GENERATION_TIMEOUT_SECONDS = 90    # NFR: 90초 이내 (trd.md §9)


@shared_task(
    name="tasks.generate_track",
    bind=True,
    max_retries=0,           # 재시도 없음 — 클라이언트가 동일 job_id로 재시도
    acks_late=True,          # task 완료 후 ack → worker 크래시 시 재실행 방지
    time_limit=120,          # Celery 강제 종료 시간 (90s 추론 + 30s 버퍼)
    soft_time_limit=95,      # SoftTimeLimitExceeded → 정상 실패 처리
)
def generate_track_task(
    self,
    track_id: str,
    job_id: str,
    user_id: str,
    entitlement: str,
    voice_sample_id: str,
    song_key: str,
    s3_sample_key: str,
):
    """
    GPU 추론 + mp3 S3 업로드 + 상태 업데이트.

    실행 순서:
    1. status = 'processing'
    2. VoiceInferenceClient.generate() 호출 (최대 90초)
    3a. 성공: mp3 S3 업로드 → status='completed' + counter +1 + sample 삭제 예약
    3b. 실패: status='failed' + error_message + sample 삭제 예약
    """
    from celery.exceptions import SoftTimeLimitExceeded

    _track_id = uuid.UUID(track_id)
    _job_id   = uuid.UUID(job_id)
    _user_id  = uuid.UUID(user_id)
    _sample_id = uuid.UUID(voice_sample_id)

    logger.info(
        "generation.task.start",
        job_id=job_id,
        track_id=track_id,
        song_key=song_key,
    )

    with SyncSessionLocal() as db:
        # ── Step 1: status → processing ────────────────────────
        db.execute(
            update(GeneratedTrack)
            .where(GeneratedTrack.id == _track_id)
            .values(status="processing")
        )
        db.commit()

        # ── Step 2: GPU 추론 ────────────────────────────────────
        client = get_inference_client()
        inference_input = InferenceInput(
            s3_sample_key=s3_sample_key,
            song_key=song_key,
            job_id=_job_id,
        )

        try:
            result = client.generate(inference_input)
        except SoftTimeLimitExceeded:
            # Celery soft time limit (95s) 초과 → 타임아웃 처리
            result_mp3 = None
            error_msg  = "timeout: exceeded 90 seconds"
            elapsed_ms = GENERATION_TIMEOUT_SECONDS * 1000
            logger.warning("generation.task.timeout", job_id=job_id)
            _fail_track(db, _track_id, _sample_id, error_msg, elapsed_ms)
            return

        schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

        if result.success:
            # ── Step 3a: 성공 처리 ─────────────────────────────
            s3_key = storage_service.upload_mp3(
                user_id=_user_id,
                track_id=_track_id,
                mp3_bytes=result.mp3_bytes,
            )

            db.execute(
                update(GeneratedTrack)
                .where(GeneratedTrack.id == _track_id)
                .values(
                    status="completed",
                    s3_key=s3_key,
                    gpu_duration_ms=result.duration_ms,
                    completed_at=datetime.now(timezone.utc),
                )
            )

            # counter +1 (무료 유저만, 성공 시에만)
            increment_on_success(db, _user_id, entitlement)

            # voice_sample 삭제 예약 (Story 4)
            db.execute(
                update(VoiceSample)
                .where(VoiceSample.id == _sample_id)
                .values(schedule_delete_at=schedule_delete)
            )

            db.commit()

            logger.info(
                "generation.task.completed",
                job_id=job_id,
                track_id=track_id,
                s3_key=s3_key,
                duration_ms=result.duration_ms,
            )

        else:
            # ── Step 3b: 실패 처리 ─────────────────────────────
            _fail_track(db, _track_id, _sample_id, result.error_message or "unknown", result.duration_ms)


def _fail_track(
    db,
    track_id: uuid.UUID,
    sample_id: uuid.UUID,
    error_message: str,
    duration_ms: int,
):
    """실패 공통 처리: track failed + sample 삭제 예약"""
    schedule_delete = datetime.now(timezone.utc) + timedelta(hours=SAMPLE_DELETE_DELAY_HOURS)

    db.execute(
        update(GeneratedTrack)
        .where(GeneratedTrack.id == track_id)
        .values(
            status="failed",
            error_message=error_message,
            gpu_duration_ms=duration_ms,
        )
    )
    # 실패해도 샘플 삭제 예약 (Story 4: 24h TTL 보장)
    db.execute(
        update(VoiceSample)
        .where(VoiceSample.id == sample_id)
        .values(schedule_delete_at=schedule_delete)
    )
    db.commit()

    logger.warning(
        "generation.task.failed",
        track_id=str(track_id),
        error_message=error_message,
        duration_ms=duration_ms,
    )
```

---

## 3. Generation Service (상태 조회)

```python
# apps/api/app/services/generation_service.py

import uuid
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.generated_track import GeneratedTrack
from app.schemas.generations import GenerationStatusResponse
from app.services import storage_service

logger = structlog.get_logger()


async def get_generation_status(
    db: AsyncSession,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
) -> GenerationStatusResponse:
    """
    GET /generations/{job_id} — 폴링 엔드포인트.
    클라이언트는 5초 간격으로 호출.
    status='completed' 시 presigned URL(1h) 포함 반환.
    """
    result = await db.execute(
        select(GeneratedTrack).where(
            GeneratedTrack.job_id == job_id,
            GeneratedTrack.user_id == user_id,
        )
    )
    track = result.scalar_one_or_none()

    if track is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="생성 작업을 찾을 수 없어요.",
        )

    presigned_url = None
    if track.status == "completed" and track.s3_key:
        presigned_url = storage_service.generate_presigned_url(track.s3_key)

    return GenerationStatusResponse(
        job_id=str(track.job_id),
        track_id=str(track.id),
        status=track.status,
        presigned_url=presigned_url,
        error_message=track.error_message,
        queue_position=None,    # 향후 Celery queue depth 조회로 구현
    )
```

---

## 4. 라우터

```python
# apps/api/app/api/v1/generations.py

import uuid
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.generations import (
    GenerationInitRequest, GenerationInitResponse,
    GenerationStatusResponse, CounterStatusResponse,
)
from app.services.counter_service import check_and_reserve, get_counter_status
from app.services.generation_service import get_generation_status
from app.tasks.generation import generate_track_task
from app.models.voice_sample import VoiceSample
from sqlalchemy import select

router = APIRouter(prefix="/generations", tags=["generations"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = structlog.get_logger()


def _require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """JWT 검증 → {"sub": user_id, "entitlement": "free"|"trial"|"premium"} 반환"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return {
            "sub": payload["sub"],
            "entitlement": payload.get("entitlement", "free"),
        }
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


@router.post("/init", response_model=GenerationInitResponse, status_code=201)
async def init_generation(
    body: GenerationInitRequest,
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    생성 잡 등록.
    1. 횟수 체크 + 멱등성 확인 (impl/02 CounterService)
    2. GeneratedTrack 생성 (status='pending')
    3. Celery task 큐 등록

    멱등 재시도: 동일 job_id 재요청 시 is_new=False + 기존 상태 반환.
    Celery task는 is_new=True인 경우에만 큐에 등록.
    """
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]

    # ── 카운터 체크 + 멱등성 처리 ────────────────────────────────
    init_result = await check_and_reserve(db, user_id, entitlement, body)

    if not init_result.is_new:
        # 기존 job_id → Celery 재큐 없이 현재 상태만 반환
        logger.info(
            "generation.init.idempotent",
            user_id=str(user_id),
            job_id=str(body.job_id),
            status=init_result.status,
        )
        return init_result

    # ── voice_sample의 s3_key 조회 (Celery task에 전달) ──────────
    sample_result = await db.execute(
        select(VoiceSample).where(VoiceSample.id == body.voice_sample_id)
    )
    sample = sample_result.scalar_one_or_none()
    if sample is None or not sample.s3_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="녹음 파일 정보를 찾을 수 없어요.",
        )

    # ── Celery task 큐 등록 ──────────────────────────────────────
    generate_track_task.delay(
        track_id=init_result.track_id,
        job_id=str(body.job_id),
        user_id=str(user_id),
        entitlement=entitlement,
        voice_sample_id=str(body.voice_sample_id),
        song_key=body.song_key,
        s3_sample_key=sample.s3_key,
    )

    logger.info(
        "generation.init.queued",
        user_id=str(user_id),
        job_id=str(body.job_id),
        track_id=init_result.track_id,
    )

    return init_result


@router.get("/{job_id}", response_model=GenerationStatusResponse)
async def get_generation(
    job_id: str,
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    생성 상태 폴링.
    클라이언트: 5초 간격 polling (S12 화면).
    completed 시 presigned URL 포함 반환.
    """
    user_id = uuid.UUID(auth["sub"])
    return await get_generation_status(db, user_id, uuid.UUID(job_id))


@router.get("/counter/me", response_model=CounterStatusResponse)
async def get_my_counter(
    auth: dict = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    현재 유저 생성 횟수 조회.
    클라이언트: S07/S08/S10 화면 진입 시 호출해 "생성 N/3" UI 동기화.
    """
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]
    counter_data = await get_counter_status(db, user_id, entitlement)
    return CounterStatusResponse(**counter_data)
```

---

## 5. API 엔드포인트 요약

| Method | URL | 역할 | 인증 |
|---|---|---|---|
| POST | `/api/v1/generations/init` | 생성 잡 등록 | Bearer JWT |
| GET | `/api/v1/generations/{job_id}` | 상태 폴링 | Bearer JWT |
| GET | `/api/v1/generations/counter/me` | 생성 횟수 조회 | Bearer JWT |

---

## 6. 폴링 흐름 (클라이언트 ↔ 서버)

```
[S12 화면 진입]
      │
      ├─ POST /generations/init (job_id, voice_sample_id, song_key)
      │         └─ 201: { job_id, track_id, status:'pending', is_new:true }
      │
      ├─ 5초 대기
      │
      ├─ GET /generations/{job_id}
      │         └─ { status: 'processing', presigned_url: null }
      │
      ├─ 5초 대기
      │
      ├─ GET /generations/{job_id}
      │         └─ { status: 'completed', presigned_url: 'https://s3...' }
      │                   └─ S13 이동 + mp3 다운로드
      │
      └─ (90초 초과 시) 타임아웃 상태 → 재시도 또는 홈 이동
```

---

## 7. SyncSessionLocal 설정 (Celery용)

```python
# apps/api/app/core/db.py (기존 파일에 추가)
# Celery task는 asyncio 없이 동기 세션 사용

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 기존 async engine은 FastAPI용으로 유지
# Celery task용 sync engine 추가
_sync_engine = create_engine(
    settings.DATABASE_URL.replace("+asyncpg", ""),  # asyncpg → psycopg2
    pool_size=5,
    max_overflow=2,
)
SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)

# 의존성: psycopg2 패키지 설치 필요
# pip install psycopg2-binary
# requirements.txt에 추가 필수
```

---

## 8. 결정 근거

### 폴링 vs WebSocket

**WebSocket**: 서버가 완료 시 push. 연결 유지 비용 + Celery-WebSocket 브리지(Redis pub/sub) 필요.  
기각 이유: 추가 인프라(Redis Channels 또는 FastAPI WebSocket manager). MVP 복잡도 과도.

**채택(5초 폴링)**: 단순 HTTP GET. 90초 최대 18회 호출. 서버 부하 미미. M0 이후 사용자 증가 시 WebSocket으로 upgrade 가능한 구조.

### Celery max_retries=0 (재시도 없음)

클라이언트가 동일 `job_id`로 재시도하면 멱등성 체크(impl/02)에서 기존 track을 반환하고 새 Celery task를 큐에 올리지 않는다. 단, status='failed'인 경우 **클라이언트가 새 job_id를 생성해 재시도**해야 한다 (동일 job_id 재시도는 failed 상태만 반환).

> 결정 근거: status='failed' 레코드에 대해 동일 job_id로 재큐를 허용하면 job_id의 단일 상태 보장이 무너진다. failed → pending 상태 역전은 버그 추적을 어렵게 한다.

### entitlement는 JWT에서 읽기

JWT에 `entitlement` 클레임 포함. 구독 변경은 RevenueCat webhook → subscriptions 테이블 업데이트 + 클라이언트 토큰 갱신 흐름으로 처리. 생성 요청 시 subscriptions 테이블 실시간 조회는 DB 부하 + 응답 지연. JWT 클레임이 최대 액세스 토큰 만료(기본 15분)까지 stale할 수 있으나, 생성 횟수 제한은 서버 counter가 2차 방어선.

---

## 9. 수용 기준

### POST /generations/init
- [ ] JWT 없음 → 401
- [ ] 무료 유저 count=3 → 402 `GENERATION_LIMIT_EXCEEDED`
- [ ] 정상 요청 → 201 + `{ job_id, track_id, status:'pending', is_new:true }`
- [ ] DB: GeneratedTrack status='pending', voice_sample status='generation_started' 확인
- [ ] 동일 job_id 재요청 → 201 + `{ is_new: false, status: 현재 상태 }` (Celery 재큐 없음 확인)

### GET /generations/{job_id}
- [ ] status='pending' → `{ status:'pending', presigned_url: null }`
- [ ] status='completed' → `{ status:'completed', presigned_url: 'https://...' }` (URL 형식 확인)
- [ ] 다른 유저 job_id → 404

### Celery task
- [ ] `MOCK_GPU=true` 환경 → 3초 후 status='completed', S3에 mp3 업로드 확인
- [ ] `MOCK_FAIL_RATE=1.0` → status='failed', error_message 존재 확인
- [ ] 완료 후 voice_sample.schedule_delete_at = now() + 24h 확인 (성공 + 실패 모두)
- [ ] 성공 후 generation_counters.count +1 확인 (무료 유저), 프리미엄 유저는 변경 없음

---

## 10. 주의사항

- `SyncSessionLocal`은 Celery task에서만 사용한다. FastAPI 라우터에서는 기존 `get_db()` (async) 사용.
- `psycopg2-binary` 의존성 추가 필요. `requirements.txt` 또는 `pyproject.toml`에 반드시 포함.
- `acks_late=True` 설정은 worker 크래시 시 task가 다른 worker에서 재실행됨을 의미한다. `generate_track_task`는 멱등하게 설계됐지만 (실행 전 status='processing' 체크), 재실행 전 DB 상태 확인 로직 추가가 안전하다: task 시작 시 status='completed'이면 즉시 return.
- S3 업로드는 Celery worker에서 동기 boto3로 실행. S3 네트워크 지연이 90초 타임아웃에 포함되므로, 추론 성공 후 S3 업로드 실패 시 status='failed'로 처리한다 (별도 에러 코드로 구분 권장).
- `GET /generations/counter/me` URL 경로 순서 주의: FastAPI 라우터에서 `"/{job_id}"` 이전에 `"/counter/me"` 등록 필요. 순서가 바뀌면 `counter`가 `job_id` 파라미터로 인식된다.
