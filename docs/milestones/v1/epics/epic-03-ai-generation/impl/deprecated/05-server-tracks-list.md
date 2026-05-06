---
depth: std
design: skipped
---

# impl/05 — 서버: 트랙 목록 API (GET /tracks + has_pending 플래그)

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 5 (홈 화면 음원 목록), Story 1 (백그라운드 생성 완료 후 홈 카드 노출)  
**선행 조건**: impl/01 (GeneratedTrack ORM), impl/04 (generation pipeline — track 생성 흐름)  
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── __init__.py                   [수정 — tracks router include]
│   └── tracks.py                     [신규 — 트랙 목록 라우터]
├── schemas/
│   └── tracks.py                     [신규 — TrackItem, TracksListResponse]
└── services/
    └── tracks_service.py             [신규 — 트랙 목록 조회 서비스]
```

---

## 2. Pydantic 스키마

```python
# apps/api/app/schemas/tracks.py

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TrackItem(BaseModel):
    """홈 화면 트랙 카드 1개 데이터."""
    id:           str
    job_id:       str
    song_key:     str
    song_name:    str            # song_key → 한국어 곡명 변환 (서버에서 처리)
    status:       str            # completed | pending | processing | failed
    presigned_url: Optional[str] = None   # status='completed'이고 요청 시 포함
    created_at:   datetime
    completed_at: Optional[datetime] = None


class TracksListResponse(BaseModel):
    """
    GET /tracks 응답.
    has_pending: 현재 생성 중인 트랙 존재 여부.
    클라이언트가 홈 진입 시 이 플래그를 확인해 폴링 재개 여부 결정.
    last_checked_at: 클라이언트가 이전에 확인한 시각 이후 completed된 트랙이 있으면
    completed_since_last_check=True → "생성 완료 카드" 노출 트리거.
    """
    tracks:                     List[TrackItem]
    has_pending:                bool    # pending 또는 processing 트랙 존재 여부
    completed_since_last_check: bool    # 백그라운드 생성 완료 감지용
    total:                      int


class TrackDeleteResponse(BaseModel):
    id:      str
    deleted: bool
```

---

## 3. 트랙 서비스

```python
# apps/api/app/services/tracks_service.py

import uuid
import structlog
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from fastapi import HTTPException, status

from app.models.generated_track import GeneratedTrack
from app.schemas.tracks import TrackItem, TracksListResponse
from app.services import storage_service

logger = structlog.get_logger()

# song_key → 한국어 이름 매핑 (docs/domain-logic.md §곡 목록과 동기화 필요)
SONG_NAME_MAP = {
    "brahms":    "브람스 자장가",
    "mozart":    "모차르트 자장가",
    "schubert":  "슈베르트 자장가",
    "twinkle":   "반짝반짝 작은 별",
    "rockabye":  "로커바이 베이비",
    "hush":      "허쉬 리틀 베이비",
}


async def list_tracks(
    db: AsyncSession,
    user_id: uuid.UUID,
    last_checked_at: Optional[datetime] = None,
    include_presigned: bool = True,
) -> TracksListResponse:
    """
    유저 트랙 목록 조회.

    last_checked_at: 클라이언트가 마지막으로 홈을 확인한 시각 (ISO8601 쿼리 파라미터).
    - 이 시각 이후 completed된 트랙이 있으면 completed_since_last_check=True
    - 클라이언트는 이 플래그로 "새 자장가 완성!" 카드 노출 여부 결정

    include_presigned: completed 트랙에 presigned URL 포함 여부.
    - 홈 화면은 True (트랙 목록 탭 시 바로 재생 가능하도록)
    - 최적화 필요 시 False로 요청 후 재생 시점에 별도 조회 가능
    """
    result = await db.execute(
        select(GeneratedTrack)
        .where(
            GeneratedTrack.user_id == user_id,
            GeneratedTrack.status.in_(["completed", "pending", "processing", "failed"]),
        )
        .order_by(GeneratedTrack.created_at.desc())
        .limit(50)  # V1: 최대 50개 (무제한 저장 정책)
    )
    tracks = result.scalars().all()

    has_pending = any(t.status in ("pending", "processing") for t in tracks)

    completed_since_last_check = False
    if last_checked_at is not None:
        completed_since_last_check = any(
            t.status == "completed"
            and t.completed_at is not None
            and t.completed_at > last_checked_at
            for t in tracks
        )

    track_items = []
    for t in tracks:
        presigned_url = None
        if include_presigned and t.status == "completed" and t.s3_key:
            try:
                presigned_url = storage_service.generate_presigned_url(t.s3_key)
            except Exception as e:
                logger.error(
                    "tracks.presign.failed",
                    track_id=str(t.id),
                    error=str(e),
                )
                # presigned URL 실패해도 목록 자체는 반환 (url=null)

        track_items.append(TrackItem(
            id=str(t.id),
            job_id=str(t.job_id),
            song_key=t.song_key,
            song_name=SONG_NAME_MAP.get(t.song_key, t.song_key),
            status=t.status,
            presigned_url=presigned_url,
            created_at=t.created_at,
            completed_at=t.completed_at,
        ))

    logger.info(
        "tracks.list.fetched",
        user_id=str(user_id),
        count=len(track_items),
        has_pending=has_pending,
    )

    return TracksListResponse(
        tracks=track_items,
        has_pending=has_pending,
        completed_since_last_check=completed_since_last_check,
        total=len(track_items),
    )


async def delete_track(
    db: AsyncSession,
    user_id: uuid.UUID,
    track_id: uuid.UUID,
) -> None:
    """
    트랙 삭제 (S06 스와이프/롱탭 → 삭제 확인).
    S3 mp3 파일도 함께 삭제.
    pending/processing 트랙은 삭제 불가 (409 반환).
    """
    result = await db.execute(
        select(GeneratedTrack).where(
            GeneratedTrack.id == track_id,
            GeneratedTrack.user_id == user_id,
        )
    )
    track = result.scalar_one_or_none()

    if track is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="트랙을 찾을 수 없어요.")

    if track.status in ("pending", "processing"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="생성 중인 트랙은 삭제할 수 없어요. 생성이 완료된 후 삭제해주세요.",
        )

    # S3 mp3 삭제 (completed 트랙인 경우)
    if track.s3_key:
        try:
            import boto3
            from app.core.config import settings
            s3 = boto3.client(
                "s3",
                region_name=settings.S3_REGION,
                aws_access_key_id=settings.S3_ACCESS_KEY,
                aws_secret_access_key=settings.S3_SECRET_KEY,
            )
            s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=track.s3_key)
            logger.info("tracks.s3.deleted", track_id=str(track_id), s3_key=track.s3_key)
        except Exception as e:
            logger.error("tracks.s3.delete.failed", track_id=str(track_id), error=str(e))
            # S3 삭제 실패해도 DB 레코드는 삭제 진행 (orphan 파일은 S3 lifecycle로 정리)

    await db.delete(track)
    await db.commit()

    logger.info("tracks.deleted", user_id=str(user_id), track_id=str(track_id))
```

---

## 4. 라우터

```python
# apps/api/app/api/v1/tracks.py

import uuid
import structlog
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from jose import JWTError

from app.core.db import get_db
from app.core.security import decode_token
from app.schemas.tracks import TracksListResponse, TrackDeleteResponse
from app.services.tracks_service import list_tracks, delete_track

router = APIRouter(prefix="/tracks", tags=["tracks"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = structlog.get_logger()


def _require_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


@router.get("/", response_model=TracksListResponse)
async def get_my_tracks(
    last_checked_at: Optional[datetime] = Query(
        default=None,
        description="마지막 홈 확인 시각 (ISO8601). 이후 completed 트랙 있으면 completed_since_last_check=true.",
    ),
    include_presigned: bool = Query(
        default=True,
        description="completed 트랙에 presigned URL 포함 여부 (기본 true).",
    ),
    user_id: str = Depends(_require_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    내 트랙 목록. S06 홈 화면 진입 시 호출.

    클라이언트 호출 패턴:
    1. 홈 진입 시: GET /tracks?last_checked_at={이전 진입 시각}
    2. completed_since_last_check=true → "생성 완료 카드" 노출
    3. has_pending=true → S12 Generating 화면에서 폴링 재개 (재진입 동선)
    """
    return await list_tracks(
        db=db,
        user_id=uuid.UUID(user_id),
        last_checked_at=last_checked_at,
        include_presigned=include_presigned,
    )


@router.delete("/{track_id}", response_model=TrackDeleteResponse)
async def delete_my_track(
    track_id: str,
    user_id: str = Depends(_require_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    트랙 삭제 (S06 스와이프 → 삭제 확인).
    생성 중(pending/processing) 트랙은 409 반환.
    """
    await delete_track(db, uuid.UUID(user_id), uuid.UUID(track_id))
    return TrackDeleteResponse(id=track_id, deleted=True)
```

---

## 5. 클라이언트 last_checked_at 활용 패턴

```
[앱 포그라운드 복귀]
        │
        ├─ AsyncStorage에서 last_home_visit_at 읽기
        │
        ├─ GET /tracks?last_checked_at={last_home_visit_at}
        │
        ├─ completed_since_last_check=true → "생성 완료 카드" 상단 노출 (pulse glow)
        │
        ├─ has_pending=true → pending track의 job_id로 폴링 재개
        │         └─ S12 "홈으로 이동" 탭 후 포그라운드 복귀 동선
        │
        └─ AsyncStorage: last_home_visit_at = now() 업데이트
```

---

## 6. 결정 근거

### last_checked_at 쿼리 파라미터 방식 (vs 서버 알림 방식)

**서버 알림 방식** (대안): completed 시 FCM 푸시 → 클라이언트 홈 배지  
기각 이유: FCM 연동 추가 인프라. Story 3 수용 기준: "홈으로 이동" 후 완료 시 카드 표시 — 푸시 알림 없음 명시.

**채택**: 클라이언트가 마지막 홈 방문 시각을 저장 → 다음 홈 진입 시 서버에 전달. 서버는 이 시각 이후 completed된 트랙 여부만 반환. 단순하고 서버 상태(알림 토큰 등) 불필요.

### failed 트랙도 목록에 포함

V1에서 failed 트랙을 목록에서 제외하면 클라이언트가 실패 원인을 파악할 수 없다. 포함하되 클라이언트 UI에서 "생성 실패 — 다시 시도" 카드로 표시 (impl/07에서 처리). 30일 이상 failed 트랙은 Celery Beat로 주기 정리 (V2 범위).

### presigned URL을 목록 응답에 포함

**대안**: 목록은 s3_key만 반환, 재생 클릭 시 별도 GET /tracks/{id}/url 호출  
기각 이유: 홈에서 트랙 탭 → 재생 화면 이동까지 추가 API 왕복 발생. 모바일 네트워크에서 체감 지연.

**채택**: 홈 진입 시 presigned URL 일괄 발급 (1h 만료). 트랙 수가 적은 초기 단계에서 부하 미미. 트랙 수 증가 시 include_presigned=false 옵션으로 전환 가능.

---

## 7. 수용 기준

### GET /tracks
- [ ] JWT 없음 → 401
- [ ] 트랙 없음 → `{ tracks: [], has_pending: false, total: 0 }`
- [ ] completed 트랙 → TrackItem.presigned_url 존재 (has_pending=false)
- [ ] pending 트랙 → has_pending=true, presigned_url=null
- [ ] last_checked_at 이전에 completed된 트랙만 있음 → completed_since_last_check=false
- [ ] last_checked_at 이후에 completed된 트랙 있음 → completed_since_last_check=true

### DELETE /tracks/{id}
- [ ] 정상 삭제 → 200 `{ deleted: true }`
- [ ] 다른 유저 track_id → 404
- [ ] status='pending' 트랙 → 409
- [ ] S3 mp3 파일 삭제 확인 (mock S3)

---

## 8. 주의사항

- `last_checked_at` 쿼리 파라미터는 timezone-aware datetime이어야 한다. FastAPI가 ISO8601 파싱 시 timezone 없으면 naive datetime으로 처리되어 DB의 timezone-aware `completed_at`과 비교 오류 발생. 클라이언트는 반드시 UTC timezone 포함 형식 전송 (예: `2026-04-24T10:30:00Z`).
- `delete_track` 내 S3 삭제는 동기 boto3 호출이다. FastAPI async 라우터에서 동기 블로킹 호출은 event loop를 블로킹한다. `asyncio.to_thread(s3.delete_object, ...)` 또는 `run_in_executor`로 비동기 래핑 권장. MVP에서는 S3 삭제 지연이 짧아 허용하되, engineer가 구현 시 비동기 래핑 추가.
- `SONG_NAME_MAP`은 `docs/domain-logic.md` 곡 목록과 동기화 필수. 곡이 추가/변경되면 이 맵과 GeneratedTrack `song_key` CHECK constraint를 함께 수정.
- 트랙 목록 최대 50개 제한은 V1 임시값. `generation_counters.count`가 최대 3이므로 무료 유저는 최대 3개. 프리미엄 유저를 위한 페이지네이션은 V2 범위.
