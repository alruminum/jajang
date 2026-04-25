---
depth: std
design: skipped
---

# impl/01 — 서버: 자장가 목록 & 미리듣기 API

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 1 (자장가 선택 — 서버 측)  
**선행 조건**: Epic 01 완료 (JWT 인증, DB 연결, S3 설정)  
**예상 소요**: 2~3시간

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── api/v1/
│   ├── __init__.py             [수정 — songs router include]
│   └── songs.py                [신규 — 자장가 목록/미리듣기 라우터]
├── schemas/
│   └── songs.py                [신규 — SongResponse, PreviewResponse]
├── services/
│   └── songs_service.py        [신규 — presigned URL 발급 로직]
└── core/
    └── config.py               [수정 — S3_PREVIEW_EXPIRY_SECONDS 추가]
```

---

## 2. 데이터 설계

### 자장가 메타 (정적 상수, DB 없음)

V1에서 자장가 6곡은 DB 테이블이 아닌 서버 상수로 관리한다.

**선택 이유**: 6곡은 MVP 전 기간 고정. DB 테이블 + 마이그레이션 비용 대비 이득 없음.  
**변경 시**: 코드 배포 불가피하나, 1인 개발 MVP에서 곡 추가 빈도는 분기 1회 미만으로 예상.

```python
# apps/api/app/services/songs_service.py

from dataclasses import dataclass

@dataclass(frozen=True)
class SongMeta:
    key: str          # DB song_key 컬럼과 동일 값
    title_ko: str
    title_en: str
    composer: str
    duration_seconds: int   # 전체 길이 (정보 표시용)
    preview_s3_key: str     # S3 내 미리듣기 mp3 경로 (30초 클립)

SONGS: list[SongMeta] = [
    SongMeta("brahms",    "브람스 자장가",    "Brahms' Lullaby",     "요하네스 브람스",  180, "previews/brahms_preview.mp3"),
    SongMeta("mozart",    "모차르트 자장가",   "Mozart's Lullaby",    "볼프강 모차르트",  150, "previews/mozart_preview.mp3"),
    SongMeta("schubert",  "슈베르트 자장가",  "Schubert's Lullaby",  "프란츠 슈베르트", 200, "previews/schubert_preview.mp3"),
    SongMeta("twinkle",   "반짝반짝 작은 별", "Twinkle Twinkle",     "전통 민요",       120, "previews/twinkle_preview.mp3"),
    SongMeta("rockabye",  "자장자장 (영)",     "Rock-a-bye Baby",     "전통 민요",       130, "previews/rockabye_preview.mp3"),
    SongMeta("hush",      "허쉬 리틀 베이비", "Hush Little Baby",    "전통 민요",       140, "previews/hush_preview.mp3"),
]

SONGS_BY_KEY: dict[str, SongMeta] = {s.key: s for s in SONGS}
```

> **S3 미리듣기 파일 위치**: `jajang-audio/previews/{song_key}_preview.mp3`  
> 30초 클립은 배포 전 PD가 직접 편집해 S3 `previews/` prefix에 업로드.  
> 라이선스 원문 링크 → `docs/reference.md §멜로디 소스` 섹션에 기록 필수 (별도 태스크).

---

## 3. Pydantic 스키마

```python
# apps/api/app/schemas/songs.py

from pydantic import BaseModel, HttpUrl

class SongResponse(BaseModel):
    key: str
    title_ko: str
    title_en: str
    composer: str
    duration_seconds: int

class SongListResponse(BaseModel):
    songs: list[SongResponse]

class PreviewUrlResponse(BaseModel):
    song_key: str
    preview_url: str    # presigned URL (만료 PREVIEW_EXPIRY_SECONDS)
    expires_in_seconds: int
```

---

## 4. 서비스 로직

```python
# apps/api/app/services/songs_service.py (계속)

import boto3
from botocore.exceptions import ClientError
from app.core.config import settings
from app.schemas.songs import SongResponse, SongListResponse, PreviewUrlResponse


def get_all_songs() -> SongListResponse:
    """정적 상수에서 목록 반환 — DB 조회 없음."""
    return SongListResponse(
        songs=[
            SongResponse(
                key=s.key,
                title_ko=s.title_ko,
                title_en=s.title_en,
                composer=s.composer,
                duration_seconds=s.duration_seconds,
            )
            for s in SONGS
        ]
    )


def get_preview_url(song_key: str) -> PreviewUrlResponse:
    """
    S3 presigned GET URL 발급 (만료 PREVIEW_EXPIRY_SECONDS).
    존재하지 않는 song_key → ValueError.
    S3 ClientError → 그대로 상위로 전파 (라우터에서 500 처리).
    """
    if song_key not in SONGS_BY_KEY:
        raise ValueError(f"Unknown song_key: {song_key}")

    meta = SONGS_BY_KEY[song_key]
    expiry = settings.S3_PREVIEW_EXPIRY_SECONDS  # default 3600

    s3_client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        # Cloudflare R2 지원: endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT (설정 시 자동 사용)
        **({"endpoint_url": settings.CLOUDFLARE_R2_ENDPOINT} if settings.CLOUDFLARE_R2_ENDPOINT else {}),
    )

    url = s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": meta.preview_s3_key},
        ExpiresIn=expiry,
    )

    return PreviewUrlResponse(
        song_key=song_key,
        preview_url=url,
        expires_in_seconds=expiry,
    )
```

**presigned URL 채택 이유**: preview mp3도 public ACL 아님 — URL 노출 시 만료(1시간) 후 무효화. 추가 인증 없이 클라이언트에서 직접 스트리밍 가능.

---

## 5. 라우터

```python
# apps/api/app/api/v1/songs.py

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from botocore.exceptions import ClientError
import structlog

from app.core.security import decode_token
from app.schemas.songs import SongListResponse, PreviewUrlResponse
from app.services.songs_service import get_all_songs, get_preview_url

router = APIRouter(prefix="/songs", tags=["songs"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = structlog.get_logger()


def _require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """JWT 검증 공통 헬퍼 — user_id 반환."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise JWTError("invalid token type")
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요해요")


@router.get("", response_model=SongListResponse)
async def list_songs(user_id: str = Depends(_require_auth)):
    """
    자장가 6곡 목록 반환.
    인증 필요 (S07 화면은 로그인 후 진입).
    presigned URL 미포함 — 미리듣기는 /songs/{key}/preview 별도 호출.
    """
    return get_all_songs()


@router.get("/{song_key}/preview", response_model=PreviewUrlResponse)
async def get_song_preview(
    song_key: str,
    user_id: str = Depends(_require_auth),
):
    """
    미리듣기 30초 클립 presigned URL 발급.
    song_key 미존재 → 404.
    S3 오류 → 500.
    """
    try:
        return get_preview_url(song_key)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="존재하지 않는 곡이에요",
        )
    except ClientError as e:
        logger.error("s3.presign.failed", song_key=song_key, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="미리듣기를 불러올 수 없어요. 잠시 후 다시 시도해주세요",
        )
```

**URL 패턴**: `GET /api/v1/songs`, `GET /api/v1/songs/{song_key}/preview`

---

## 6. config.py 수정

```python
# apps/api/app/core/config.py 에 추가할 필드
S3_PREVIEW_EXPIRY_SECONDS: int = 3600   # presigned URL 유효 시간 (1시간)
```

---

## 7. main.py 수정

```python
# apps/api/app/main.py 에 추가
from app.api.v1.songs import router as songs_router

app.include_router(songs_router, prefix="/api/v1")
```

---

## 8. 관찰가능성

```python
# structlog 포인트
logger.info("songs.list", user_id=user_id)
logger.info("songs.preview.issued", song_key=song_key, user_id=user_id)
logger.error("s3.presign.failed", song_key=song_key, error=str(e))
```

Sentry: 404는 정상 흐름 — capture 불필요. S3 `ClientError` (500)는 Sentry capture.

---

## 9. 수용 기준

- [ ] `GET /api/v1/songs` — JWT 없음 → 401
- [ ] `GET /api/v1/songs` — 유효한 JWT → 200 + 6곡 목록 (key, title_ko, title_en, composer, duration_seconds)
- [ ] `GET /api/v1/songs/brahms/preview` — 200 + presigned URL + expires_in_seconds
- [ ] `GET /api/v1/songs/unknown/preview` — 404 + "존재하지 않는 곡이에요"
- [ ] 반환 곡 수 정확히 6개 (brahms, mozart, schubert, twinkle, rockabye, hush)
- [ ] presigned URL은 S3/R2 `previews/` prefix를 가리키는 HTTPS URL 형식

---

## 10. 주의사항

- 미리듣기 presigned URL은 목록 API(`GET /songs`)에 포함하지 않는다. 탭 이벤트 시 개별 요청하는 방식이 불필요한 S3 URL 생성과 만료 클라이언트 캐싱 관리를 줄인다.
- `CLOUDFLARE_R2_ENDPOINT` 미설정 시 boto3는 AWS S3로 동작 — R2 전환 시 환경변수 1개만 변경.
- 생성 횟수(N/3 칩 표시)는 이 API에서 반환하지 않는다. 클라이언트가 `AuthSlice.generationCount`(Zustand)에서 직접 읽는다.
