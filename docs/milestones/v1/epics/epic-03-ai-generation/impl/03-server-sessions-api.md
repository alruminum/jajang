---
depth: std
---

# impl/03 — [Story 3 / #193] 서버: 세션 API (POST /sessions + /recordings + /generate + GET /status + /masters)

**Epic**: 03 — DSP 음원 후처리 생성  
**커버 스토리**: Story 3 (세션/녹음/마스터 API). *주의*: 구 버전에 포함되어 있던 Story 5 (`GET /masters/me`) 와 Story 6 (카운터 enforcement) 는 본 impl 에서 분리되어 impl/05 / impl/06 단독 책임. 본 impl 의 §4 `init_session` 의 카운터 SELECT FOR UPDATE 인라인 코드는 impl/06 의 `assert_below_limit_or_raise()` 1줄로 *교체* 됨 (engineer 단계 정합). 본 impl 의 §6 `masters.py` 핸들러는 impl/05 의 cursor 기반 페이지네이션 + service 분리로 *리팩터* 됨.  
**선행 조건**: impl/01 완료 (ORM), impl/02 완료 (DspService + Celery task)  
**예상 소요**: 5~6시간

> **[v1.3.1 피벗]** 구 impl/02(CounterService), 구 impl/04(generations 라우터) 대체.  
> `api/v1/generations.py` → 410 Gone 전환 (구 클라이언트 호환).

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── sessions.py                  [신규 — 세션 라우터]
│   ├── masters.py                   [신규 — 마스터 음원 라우터]
│   ├── generations.py               [수정 — 전체 엔드포인트 410 Gone 처리]
│   └── __init__.py                  [현행 유지 — 라우터 등록은 main.py에서]
├── services/
│   ├── session_service.py           [신규 — 세션 생성 + 카운터 체크]
│   ├── storage_service.py           [수정 — generate_presigned_put_url() 추가]
│   └── counter_service.py           [현행 유지 — PAID_ENTITLEMENTS 재사용만]
├── schemas/
│   └── sessions.py                  [신규 — Pydantic v2 스키마]
└── main.py                          [수정 — sessions/masters router include 추가]
```

> **[SPEC_GAP 보강]** `api/v1/__init__.py` 는 docstring만 있는 빈 패키지 파일 — 라우터 등록은 기존 패턴대로 `main.py`의 `create_app()`에서 수행.
> `counter_service.py` 는 `PAID_ENTITLEMENTS` 상수 재사용만. 신규 함수 추가 불필요.

---

## 2. API 엔드포인트 요약

| Method | URL | 역할 | 인증 |
|---|---|---|---|
| POST | `/api/v1/sessions/init` | 세션 생성 (idempotency_key 기반 멱등) + 카운터 체크 + presigned upload URL 발급 | Bearer JWT |
| POST | `/api/v1/sessions/{id}/recordings` | 클립 등록 (S3 업로드 완료 확인 + Recording INSERT) | Bearer JWT |
| POST | `/api/v1/sessions/{id}/generate` | DSP Celery task dispatch | Bearer JWT |
| GET | `/api/v1/sessions/{id}/status` | 생성 상태 폴링 (5초 간격) | Bearer JWT |
| GET | `/api/v1/masters/me` | 완료된 음원 목록 (S06 홈) | Bearer JWT |
| * | `/api/v1/generations/*` | 410 Gone (구 클라이언트 호환) | 불필요 |

---

## 3. Pydantic 스키마

```python
# apps/api/app/schemas/sessions.py
from pydantic import BaseModel, UUID4
from typing import Optional
from datetime import datetime


class SessionInitRequest(BaseModel):
    idempotency_key: UUID4       # 클라이언트 생성 UUID (멱등성 키)
    song_key: str                # 'brahms' | 'mozart' | ...


class SessionInitResponse(BaseModel):
    session_id: str
    presigned_upload_url: str    # S3 presigned PUT URL (클립 업로드용)
    s3_key: str                  # 업로드 후 /recordings 에 전달할 키
    is_new: bool                 # False = 기존 세션 반환


class RecordingRegisterRequest(BaseModel):
    s3_key: str       # 업로드된 S3 키
    duration_ms: int  # 클립 길이 (ms)


class RecordingRegisterResponse(BaseModel):
    recording_id: str


class GenerateRequest(BaseModel):
    pass   # session_id는 path param


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str          # 'open' | 'generating' | 'completed' | 'failed'
    master_status: Optional[str] = None   # master_audio.status
    presigned_url: Optional[str] = None  # completed 시만
    error_message: Optional[str] = None


class MasterAudioItem(BaseModel):
    session_id: str
    song_key: str
    presigned_url: str
    completed_at: datetime
    dsp_duration_ms: Optional[int] = None


class MastersListResponse(BaseModel):
    items: list[MasterAudioItem]
    has_pending: bool    # S06 "생성 완료 음원 있음" 카드 표시 여부
```

---

## 4. session_service.py

```python
# apps/api/app/services/session_service.py

import uuid
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.recording_session import RecordingSession
from app.models.master_audio import MasterAudio
from app.models.generation_counter import GenerationCounter
from app.schemas.sessions import SessionInitRequest, SessionInitResponse
from app.services import storage_service

logger = structlog.get_logger()


async def init_session(
    db: AsyncSession,
    user_id: uuid.UUID,
    entitlement: str,
    body: SessionInitRequest,
) -> SessionInitResponse:
    """
    세션 생성.
    1. 카운터 체크 (무료 유저만, SELECT FOR UPDATE)
    2. idempotency_key로 기존 세션 조회 → 있으면 반환 (멱등)
    3. RecordingSession + MasterAudio INSERT
    4. presigned PUT URL 발급
    """
    # ── 1. 카운터 체크 (무료 유저) ─────────────────────────────────
    if entitlement == "free":
        result = await db.execute(
            select(GenerationCounter)
            .where(GenerationCounter.user_id == user_id)
            .with_for_update()
        )
        counter = result.scalar_one_or_none()
        if counter and counter.count >= 3:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "GENERATION_LIMIT_EXCEEDED", "count": counter.count},
            )

    # ── 2. 멱등성 체크 ────────────────────────────────────────────
    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.idempotency_key == body.idempotency_key)
    )
    existing = result.scalar_one_or_none()
    if existing:
        # 기존 세션 presigned URL 재발급
        s3_key = f"recordings/{existing.id}/clip_{uuid.uuid4()}.m4a"
        presigned_url = storage_service.generate_presigned_put_url(s3_key)
        return SessionInitResponse(
            session_id=str(existing.id),
            presigned_upload_url=presigned_url,
            s3_key=s3_key,
            is_new=False,
        )

    # ── 3. 신규 세션 생성 ─────────────────────────────────────────
    session = RecordingSession(
        user_id=user_id,
        song_key=body.song_key,
        idempotency_key=body.idempotency_key,
    )
    db.add(session)
    await db.flush()  # session.id 확보

    master = MasterAudio(session_id=session.id)
    db.add(master)
    await db.commit()

    # ── 4. presigned PUT URL ────────────────────────────────────
    s3_key = f"recordings/{session.id}/clip_{uuid.uuid4()}.m4a"
    presigned_url = storage_service.generate_presigned_put_url(s3_key)

    return SessionInitResponse(
        session_id=str(session.id),
        presigned_upload_url=presigned_url,
        s3_key=s3_key,
        is_new=True,
    )
```

---

## 5. sessions.py 라우터 (핵심 엔드포인트)

```python
# apps/api/app/api/v1/sessions.py

import uuid
import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.db import get_db
from app.api.deps import require_auth_with_entitlement
from app.schemas.sessions import (
    SessionInitRequest, SessionInitResponse,
    RecordingRegisterRequest, RecordingRegisterResponse,
    SessionStatusResponse,
)
from app.models.recording_session import RecordingSession
from app.models.recording import Recording
from app.models.master_audio import MasterAudio
from app.services.session_service import init_session
from app.services import storage_service
from app.tasks.dsp_processing import dsp_process_task

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = structlog.get_logger()


@router.post("/init", response_model=SessionInitResponse, status_code=201)
async def session_init(
    body: SessionInitRequest,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]
    return await init_session(db, user_id, entitlement, body)


@router.post("/{session_id}/recordings", response_model=RecordingRegisterResponse, status_code=201)
async def register_recording(
    session_id: str,
    body: RecordingRegisterRequest,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """
    클립 S3 업로드 완료 후 Recording 등록.
    S3 존재 확인 후 INSERT. is_validated=True (서버 SNR 검증은 품질 체크 단계에서 이미 완료).
    """
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])

    # session 소유자 확인
    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    recording = Recording(
        session_id=_session_id,
        s3_key=body.s3_key,
        duration_ms=body.duration_ms,
        is_validated=True,
    )
    db.add(recording)
    await db.commit()

    return RecordingRegisterResponse(recording_id=str(recording.id))


@router.post("/{session_id}/generate", status_code=202)
async def generate(
    session_id: str,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """DSP Celery task dispatch."""
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])
    entitlement = auth["entitlement"]

    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    master_result = await db.execute(
        select(MasterAudio).where(MasterAudio.session_id == _session_id)
    )
    master = master_result.scalar_one_or_none()
    if not master:
        raise HTTPException(status_code=500, detail="마스터 레코드가 없어요")

    # 이미 생성 중/완료면 중복 dispatch 방지
    if master.status in ("processing", "completed"):
        return {"message": "already processing or completed", "status": master.status}

    await db.execute(
        update(RecordingSession)
        .where(RecordingSession.id == _session_id)
        .values(status="generating")
    )
    await db.commit()

    dsp_process_task.delay(
        session_id=str(_session_id),
        master_audio_id=str(master.id),
        user_id=str(user_id),
        entitlement=entitlement,
    )

    logger.info("session.generate.dispatched", session_id=session_id)
    return {"message": "queued", "session_id": session_id}


@router.get("/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: str,
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    _session_id = uuid.UUID(session_id)
    user_id     = uuid.UUID(auth["sub"])

    result = await db.execute(
        select(RecordingSession)
        .where(RecordingSession.id == _session_id, RecordingSession.user_id == user_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없어요")

    master_result = await db.execute(
        select(MasterAudio).where(MasterAudio.session_id == _session_id)
    )
    master = master_result.scalar_one_or_none()

    presigned_url = None
    if master and master.status == "completed" and master.s3_key:
        presigned_url = storage_service.generate_presigned_url(master.s3_key)

    return SessionStatusResponse(
        session_id=str(session.id),
        status=session.status,
        master_status=master.status if master else None,
        presigned_url=presigned_url,
        error_message=master.error_message if master else None,
    )
```

---

## 6. masters.py 라우터

```python
# apps/api/app/api/v1/masters.py

import uuid
import structlog
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_db
from app.api.deps import require_auth_with_entitlement
from app.schemas.sessions import MastersListResponse, MasterAudioItem
from app.models.master_audio import MasterAudio
from app.models.recording_session import RecordingSession
from app.services import storage_service

router = APIRouter(prefix="/masters", tags=["masters"])
logger = structlog.get_logger()


@router.get("/me", response_model=MastersListResponse)
async def get_my_masters(
    auth: dict = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
):
    """
    S06 홈 화면용: 완료된 master_audios 목록 + has_pending 플래그.
    has_pending=True → "생성 완료 음원 있음" 카드 노출 여부.
    """
    user_id = uuid.UUID(auth["sub"])

    # 완료된 마스터 목록
    result = await db.execute(
        select(MasterAudio, RecordingSession)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status == "completed",
        )
        .order_by(MasterAudio.completed_at.desc())
    )
    rows = result.all()

    items = []
    for master, session in rows:
        presigned_url = storage_service.generate_presigned_url(master.s3_key)
        items.append(MasterAudioItem(
            session_id=str(session.id),
            song_key=session.song_key,
            presigned_url=presigned_url,
            completed_at=master.completed_at,
            dsp_duration_ms=master.dsp_duration_ms,
        ))

    # pending 체크 (S06 "생성 완료 음원 있음" 카드)
    pending_result = await db.execute(
        select(MasterAudio.id)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status.in_(["pending", "processing"]),
        )
        .limit(1)
    )
    has_pending = pending_result.scalar_one_or_none() is not None

    return MastersListResponse(items=items, has_pending=has_pending)
```

---

## 7. generations.py → 410 Gone 전환

```python
# apps/api/app/api/v1/generations.py (전체 교체)
"""
[DEPRECATED] v1.3.1: AI 합성 폐기 → DSP 전환.
구 클라이언트 호환을 위해 410 Gone 반환.
다음 마일스톤에서 라우터 전체 제거 예정.
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/generations", tags=["generations"])


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def generations_deprecated(path: str):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이 API는 더 이상 사용되지 않아요. /sessions 엔드포인트를 사용해주세요.",
    )
```

---

## 8. storage_service.py — generate_presigned_put_url 추가

> **[SPEC_GAP 보강]** 기존 `storage_service.py`에 presigned GET URL(`generate_presigned_url`)만 있고 PUT URL이 없음.  
> `session_service.py`가 호출하는 `storage_service.generate_presigned_put_url(s3_key)`를 신규 추가.

```python
# apps/api/app/services/storage_service.py — 기존 파일에 함수 추가 (나머지 코드 유지)

UPLOAD_PRESIGN_EXPIRY = 900     # presigned PUT URL 만료: 15분 (클립 업로드 시간 여유)

def generate_presigned_put_url(s3_key: str) -> str:
    """
    클립 업로드용 presigned PUT URL 반환 (15분 만료).
    클라이언트가 직접 S3에 m4a 파일을 PUT 업로드할 때 사용.
    """
    if settings.MOCK_S3:
        # MOCK_S3=true → mock_s3 라우터가 PUT 요청 수신 (apps/api/app/api/v1/mock_s3.py)
        # mock_s3 router prefix = "/_mock_s3" → 최종 경로: /api/v1/_mock_s3/{s3_key}
        return f"{_MOCK_BASE_URL}/api/v1/_mock_s3/{s3_key}"

    s3 = _s3_client()
    try:
        url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": "audio/x-m4a",
            },
            ExpiresIn=UPLOAD_PRESIGN_EXPIRY,
        )
        return url
    except ClientError as e:
        logger.error("storage.presign_put.failed", s3_key=s3_key, error=str(e))
        raise
```

> MOCK_S3 분기: `mock_s3.py` 라우터 prefix `/_mock_s3`, `main.py` include prefix `/api/v1` → 최종 PUT 경로 `/api/v1/_mock_s3/{key}` (코드베이스 실측 확인 완료).

---

## 9. main.py — sessions/masters 라우터 등록

> **[SPEC_GAP 보강]** `api/v1/__init__.py` 는 빈 docstring 파일. 라우터 등록은 기존 패턴대로 `main.py`의 `create_app()`에 추가.

```python
# apps/api/app/main.py — create_app() 내 기존 include_router 블록에 추가

from app.api.v1.sessions import router as sessions_router
from app.api.v1.masters import router as masters_router
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(masters_router, prefix="/api/v1")
```

등록 순서 주의: `sessions_router`는 기존 `recordings_router` 뒤에, `masters_router`는 `sessions_router` 뒤에 추가.

---

## 11. 폴링 흐름 (클라이언트 ↔ 서버)

```
[S12 화면 진입]
  │
  ├─ POST /sessions/init { idempotency_key, song_key }
  │      └─ 201: { session_id, presigned_upload_url, s3_key, is_new:true }
  │
  ├─ 클라이언트: PUT presigned_upload_url (m4a 업로드)
  │
  ├─ POST /sessions/{id}/recordings { s3_key, duration_ms }
  │      └─ 201: { recording_id }
  │
  ├─ POST /sessions/{id}/generate
  │      └─ 202: { message: "queued" }
  │
  ├─ 5초 대기
  ├─ GET /sessions/{id}/status
  │      └─ { status: "generating", master_status: "processing" }
  │
  ├─ 5초 대기
  ├─ GET /sessions/{id}/status
  │      └─ { status: "completed", master_status: "completed", presigned_url: "https://..." }
  │               └─ S13 이동 + mp3 다운로드
  │
  └─ (30초 초과) → 재시도 또는 홈 이동
```

---

## 12. 수용 기준

### POST /sessions/init
- [ ] (TEST) JWT 없음 → 401
- [ ] (TEST) 무료 유저 count=3 → 402 `GENERATION_LIMIT_EXCEEDED`
- [ ] (TEST) 정상 요청 → 201 + session_id + presigned_upload_url + s3_key + is_new:true
- [ ] (TEST) 동일 idempotency_key 재요청 → 201 + is_new:false + 기존 session_id

### POST /sessions/{id}/recordings
- [ ] (TEST) 정상 요청 → 201 + recording_id
- [ ] (TEST) 다른 유저의 session_id → 404

### POST /sessions/{id}/generate
- [ ] (TEST) 정상 요청 → 202 + Celery task 큐 등록 확인
- [ ] (TEST) status='processing' 세션 재요청 → 200 (중복 dispatch 없음)

### GET /sessions/{id}/status
- [ ] (TEST) processing → `{ master_status: "processing", presigned_url: null }`
- [ ] (TEST) completed → `{ master_status: "completed", presigned_url: "https://..." }`
- [ ] (TEST) 다른 유저 session → 404

### GET /masters/me
- [ ] (TEST) 완료 음원 있음 → items 목록 + presigned_url 포함
- [ ] (TEST) 생성 중 세션 있음 → has_pending: true
- [ ] (TEST) 완료 음원 없음 → items: [], has_pending: false

### GET /api/v1/generations/* (410)
- [ ] (TEST) 모든 경로 → 410 Gone

---

## 13. 주의사항

- `generations.py` 410 교체 후 `main.py`의 `include_router(generations.router, ...)` 는 **그대로 유지**. 라우터 제거하면 404 반환 (410과 다름).
- `require_auth` 의존성은 기존 Epic 01 구현 재사용. `api/deps.py`에 존재 확인 필수.
- presigned PUT URL 발급 함수 `storage_service.generate_presigned_put_url()`이 기존 `storage_service`에 없으면 추가 필요. 현재 구현은 presigned GET만 있을 수 있음.
- `GET /sessions/{session_id}/status`와 `GET /sessions/init` 경로 충돌 주의: FastAPI 라우터에서 `/init` 등록을 `/{session_id}` 이전에 위치.

---

MODULE_PLAN_READY
