---
depth: std
design: skipped
---

# impl/02 — 서버: 녹음 샘플 업로드 API

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 5 (샘플 업로드 서버 측), Story 3 (마이크 권한 흐름 지원)  
**선행 조건**: impl/01 완료 (songs API), Epic 01 auth 완료  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── __init__.py             [수정 — recordings router include]
│   └── recordings.py           [신규 — 녹음 업로드 라우터]
├── schemas/
│   └── recordings.py           [신규 — UploadInitRequest/Response, UploadCompleteRequest]
├── services/
│   └── recording_service.py    [신규 — presigned PUT URL 발급, VoiceSample DB 관리]
├── models/
│   └── voice_sample.py         [신규 — VoiceSample ORM (Epic 01 이후 누락분)]
└── migrations/
    └── versions/002_voice_samples.py  [신규 — Alembic 마이그레이션]
```

> **models/voice_sample.py 신규 이유**: Epic 01 범위는 users/subscriptions/generation_counters 테이블까지. voice_samples는 Epic 02 첫 서버 모델.

---

## 2. ORM 모델

```python
# apps/api/app/models/voice_sample.py

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.db import Base

class VoiceSample(Base):
    __tablename__ = "voice_samples"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id             = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    s3_key              = Column(String, nullable=False)
    status              = Column(
                            String, nullable=False, default="uploaded",
                            # 유효값: docs/db-schema.md §2 voice_samples CHECK 기준
                        )
    duration_seconds    = Column(Float)
    rms_db              = Column(Float)
    peak_count          = Column(Integer)
    snr_db              = Column(Float)                         # 서버 2차 검증 후 기록
    schedule_delete_at  = Column(DateTime(timezone=True))       # 생성 완료 후 24h
    deleted_at          = Column(DateTime(timezone=True))
    created_at          = Column(DateTime(timezone=True), nullable=False,
                                  default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="voice_samples")

    __table_args__ = (
        CheckConstraint(
            "status IN ('uploaded', 'validated', 'generation_started', 'deleted')",
            name="chk_voice_sample_status",
        ),
        Index("idx_voice_samples_user", "user_id"),
        Index(
            "idx_voice_samples_delete_schedule",
            "schedule_delete_at",
            postgresql_where="deleted_at IS NULL AND schedule_delete_at IS NOT NULL",
        ),
    )
```

> `User.voice_samples` 역참조: `apps/api/app/models/user.py`에 `voice_samples = relationship("VoiceSample", back_populates="user")` 추가 필요.

---

## 3. Pydantic 스키마

```python
# apps/api/app/schemas/recordings.py

from pydantic import BaseModel, Field
from typing import Literal

class UploadInitRequest(BaseModel):
    """
    녹음 파일 업로드 전 presigned PUT URL 요청.
    file_size_bytes: 클라이언트가 사전 계산한 파일 크기 (서버 사전 검증용).
    """
    song_key: str
    file_size_bytes: int = Field(gt=0, lt=50 * 1024 * 1024)   # 최대 50MB (안전 상한)
    content_type: Literal["audio/wav", "audio/m4a", "audio/mp4"] = "audio/wav"

class UploadInitResponse(BaseModel):
    sample_id: str          # voice_samples.id (UUID)
    upload_url: str         # S3 presigned PUT URL
    s3_key: str
    expires_in_seconds: int

class UploadCompleteRequest(BaseModel):
    """클라이언트 업로드 완료 통보 + 클라이언트 1차 검증 결과 전달."""
    sample_id: str
    duration_seconds: float = Field(gt=0)
    rms_db: float
    peak_count: int = Field(ge=0)

class UploadCompleteResponse(BaseModel):
    sample_id: str
    status: Literal["uploaded"]
    message: str = "업로드가 완료됐어요. 품질을 확인할게요."
```

---

## 4. 서비스 로직

```python
# apps/api/app/services/recording_service.py

import uuid
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
import structlog

from app.models.voice_sample import VoiceSample
from app.core.config import settings
from app.schemas.recordings import UploadInitRequest, UploadInitResponse, UploadCompleteResponse

logger = structlog.get_logger()

SAMPLE_UPLOAD_EXPIRY = 900          # presigned PUT URL 유효 시간: 15분
SAMPLE_S3_PREFIX = "samples"        # private prefix (ACL 공개 없음)


def _s3_client():
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.CLOUDFLARE_R2_ENDPOINT} if settings.CLOUDFLARE_R2_ENDPOINT else {}),
    )


async def init_upload(
    db: AsyncSession,
    user_id: uuid.UUID,
    req: UploadInitRequest,
) -> UploadInitResponse:
    """
    1. VoiceSample DB 레코드 생성 (status='uploaded' 초기값)
    2. S3 presigned PUT URL 발급 (15분 유효)
    3. 응답 반환
    """
    sample_id = uuid.uuid4()
    # 경로: samples/{user_id}/{sample_id}.wav
    # user_id 포함으로 개인 데이터 격리 + 삭제 스케줄러 조회 용이
    extension = "wav" if "wav" in req.content_type else "m4a"
    s3_key = f"{SAMPLE_S3_PREFIX}/{user_id}/{sample_id}.{extension}"

    # DB 레코드 선행 생성 (업로드 완료 콜백에서 조회 가능하도록)
    sample = VoiceSample(
        id=sample_id,
        user_id=user_id,
        s3_key=s3_key,
        status="uploaded",
    )
    db.add(sample)
    await db.commit()

    # presigned PUT URL 발급
    try:
        s3 = _s3_client()
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
                "ContentType": req.content_type,
            },
            ExpiresIn=SAMPLE_UPLOAD_EXPIRY,
        )
    except ClientError as e:
        # DB 레코드가 생성됐으나 URL 발급 실패 → 레코드 정리
        await db.delete(sample)
        await db.commit()
        logger.error("s3.presign.put.failed", user_id=str(user_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="업로드 준비에 실패했어요. 잠시 후 다시 시도해주세요",
        )

    logger.info("recording.upload.init", user_id=str(user_id), sample_id=str(sample_id))

    return UploadInitResponse(
        sample_id=str(sample_id),
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in_seconds=SAMPLE_UPLOAD_EXPIRY,
    )


async def complete_upload(
    db: AsyncSession,
    user_id: uuid.UUID,
    sample_id: str,
    duration_seconds: float,
    rms_db: float,
    peak_count: int,
) -> UploadCompleteResponse:
    """
    클라이언트 업로드 완료 통보 처리.
    - 클라이언트 1차 검증 메타 저장 (duration, rms_db, peak_count)
    - status는 'uploaded' 유지 (서버 2차 SNR 검증은 impl/03 quality_check_service에서 담당)
    """
    result = await db.execute(
        select(VoiceSample).where(
            VoiceSample.id == uuid.UUID(sample_id),
            VoiceSample.user_id == user_id,
            VoiceSample.deleted_at.is_(None),
        )
    )
    sample = result.scalar_one_or_none()
    if not sample:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="녹음 파일을 찾을 수 없어요",
        )

    sample.duration_seconds = duration_seconds
    sample.rms_db = rms_db
    sample.peak_count = peak_count
    await db.commit()

    logger.info(
        "recording.upload.complete",
        user_id=str(user_id),
        sample_id=sample_id,
        duration_seconds=duration_seconds,
        rms_db=rms_db,
        peak_count=peak_count,
    )

    return UploadCompleteResponse(sample_id=sample_id)
```

---

## 5. 라우터

```python
# apps/api/app/api/v1/recordings.py

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from jose import JWTError

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.recordings import (
    UploadInitRequest, UploadInitResponse,
    UploadCompleteRequest, UploadCompleteResponse,
)
from app.services.recording_service import init_upload, complete_upload

router = APIRouter(prefix="/recordings", tags=["recordings"])
bearer_scheme = HTTPBearer(auto_error=False)


def _require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


@router.post("/init", response_model=UploadInitResponse, status_code=201)
async def init_recording_upload(
    body: UploadInitRequest,
    user_id: str = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    녹음 파일 S3 업로드를 위한 presigned PUT URL 발급.
    song_key 유효성은 서비스 레이어에서 검증하지 않음 (impl/01 SONGS_BY_KEY 상수와 일치 여부는 클라이언트 보장).
    generations/init에서 횟수 체크하므로 이 엔드포인트는 횟수 무관.
    """
    return await init_upload(db, uuid.UUID(user_id), body)


@router.post("/{sample_id}/complete", response_model=UploadCompleteResponse)
async def complete_recording_upload(
    sample_id: str,
    body: UploadCompleteRequest,
    user_id: str = Depends(_require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    클라이언트 S3 업로드 완료 후 통보.
    클라이언트 1차 검증 메타(duration, rms_db, peak_count) 저장.
    서버 2차 품질 검증(SNR)은 별도 /recordings/{id}/validate 엔드포인트 (impl/03).
    """
    if body.sample_id != sample_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sample_id 불일치")
    return await complete_upload(
        db,
        user_id=uuid.UUID(user_id),
        sample_id=sample_id,
        duration_seconds=body.duration_seconds,
        rms_db=body.rms_db,
        peak_count=body.peak_count,
    )
```

**URL 패턴**:  
- `POST /api/v1/recordings/init` → presigned PUT URL 발급  
- `POST /api/v1/recordings/{sample_id}/complete` → 업로드 완료 통보

---

## 6. Alembic 마이그레이션

```python
# apps/api/app/migrations/versions/002_voice_samples.py

"""002 voice_samples table

Revision ID: 002_voice_samples
Revises: 001_auth
Create Date: 2026-04-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

def upgrade():
    op.create_table(
        "voice_samples",
        sa.Column("id",                 UUID(as_uuid=True),         primary_key=True),
        sa.Column("user_id",            UUID(as_uuid=True),         sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("s3_key",             sa.Text(),                  nullable=False),
        sa.Column("status",             sa.Text(),                  nullable=False, server_default="uploaded"),
        sa.Column("duration_seconds",   sa.Float()),
        sa.Column("rms_db",             sa.Float()),
        sa.Column("peak_count",         sa.Integer()),
        sa.Column("snr_db",             sa.Float()),
        sa.Column("schedule_delete_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at",         sa.DateTime(timezone=True)),
        sa.Column("created_at",         sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_check_constraint(
        "chk_voice_sample_status",
        "voice_samples",
        "status IN ('uploaded', 'validated', 'generation_started', 'deleted')",
    )
    op.create_index("idx_voice_samples_user", "voice_samples", ["user_id"])
    op.create_index(
        "idx_voice_samples_delete_schedule",
        "voice_samples",
        ["schedule_delete_at"],
        postgresql_where=sa.text("deleted_at IS NULL AND schedule_delete_at IS NOT NULL"),
    )

def downgrade():
    op.drop_index("idx_voice_samples_delete_schedule")
    op.drop_index("idx_voice_samples_user")
    op.drop_table("voice_samples")
```

---

## 7. 관찰가능성

```python
logger.info("recording.upload.init",     user_id=..., sample_id=..., song_key=...)
logger.info("recording.upload.complete", user_id=..., sample_id=..., duration_seconds=..., rms_db=...)
logger.error("s3.presign.put.failed",    user_id=..., error=...)
```

---

## 8. 수용 기준

- [ ] `POST /api/v1/recordings/init` — JWT 없음 → 401
- [ ] `POST /api/v1/recordings/init` — 정상 요청 → 201 + sample_id + upload_url (S3 presigned PUT URL)
- [ ] `POST /api/v1/recordings/init` — file_size_bytes 50MB 초과 → 422
- [ ] `POST /api/v1/recordings/{id}/complete` — 정상 요청 → 200 + "업로드가 완료됐어요"
- [ ] `POST /api/v1/recordings/{id}/complete` — 다른 유저 sample_id → 404
- [ ] voice_samples 테이블 레코드 생성 확인 (status='uploaded', s3_key 경로 = `samples/{user_id}/{sample_id}.wav`)
- [ ] complete 호출 후 duration_seconds, rms_db, peak_count DB 기록 확인
- [ ] DB 마이그레이션 `alembic upgrade head` 오류 없이 실행

---

## 9. 주의사항

- 이 엔드포인트는 생성 횟수를 체크하지 않는다. 횟수 체크는 `POST /generations/init` (Epic 03)에서 담당. 명시적 경계 유지 필수.
- presigned PUT URL 유효 시간 15분: 모바일 네트워크에서 30~60초 WAV 파일 업로드에 충분. 60초 녹음 WAV ≈ 5MB (16kHz 16bit mono).
- `s3_key`에 `user_id` 포함: IAM 정책에서 prefix 기반 접근 제어 적용 가능 (향후 멀티테넌트 격리).
- 24h 자동 삭제 스케줄러는 impl/03에서 구현 (`schedule_delete_at` 세팅 로직 포함).
- content_type `audio/m4a`와 `audio/mp4`는 동일 컨테이너. iOS에서 expo-audio는 기본적으로 `.m4a` 확장자로 녹음하므로 두 MIME 타입 모두 허용.
