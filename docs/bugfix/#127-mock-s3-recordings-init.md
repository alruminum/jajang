---
depth: std
---

# #127 — MOCK_S3 분기 누락으로 recordings/init이 실 AWS presigned URL 발급 (S3 PUT SignatureDoesNotMatch)

## 이슈 요약

`MOCK_S3=true` 환경에서도 `recording_service.init_upload()`가 boto3 `generate_presigned_url`로 실제 AWS S3 presigned PUT URL을 발급한다. URL 생성은 로컬 HMAC 연산만 쓰므로 dummy 키여도 201 응답이 나가지만, 클라이언트가 그 URL로 실제 PUT을 보내면 AWS가 dummy 서명을 거부해 403 SignatureDoesNotMatch → 모바일 토스트 "파일 업로드에 실패했어요".

PR #116(songs preview)에서만 MOCK_S3 분기를 구현했고 recordings 경로는 누락됐다. PR #123/#124 (`expo-file-system uploadAsync` 전환)은 정상 동작 — 이번 이슈와 별개.

## Depth 판정 근거: `std`

- 신규 라우트(`PUT /api/v1/_mock_s3/{path:path}`)와 신규 제어 흐름(local disk 읽기/쓰기) 도입 → "기존 구조 수정"이 아니라 "새 로직 구조 신설".
- `recording_service.py`/`quality_check_service.py`를 assertion하는 `__tests__`는 없음(`apps/api/tests/test_recordings*.py` 0건). DOM/문구/testid 변경 없음. 모바일은 무변경.
- 그러나 새 mock 라우트가 추가되므로 회귀 회피용 pytest 1건 신설 필요(MOCK_S3 분기 + 무영향 회귀 검증).

## 수정 파일 목록

| 파일 | 변경 유형 | 상세 | 담당 |
|---|---|---|---|
| `apps/api/app/services/recording_service.py` | 분기 추가 | `init_upload()`에 MOCK_S3 분기 + 헬퍼 함수 분리 가능 | engineer |
| `apps/api/app/api/v1/mock_s3.py` | 신규 파일 | `PUT /api/v1/_mock_s3/{path:path}` — body를 `apps/api/static/uploads/{path}`에 저장 후 200 | engineer |
| `apps/api/app/main.py` | router include 1줄 | `MOCK_S3=true` 시에만 `mock_s3_router` 등록 (프로덕션 노출 차단) | engineer |
| `apps/api/app/services/quality_check_service.py` | 분기 추가 | `_download_from_s3` 내부에 MOCK_S3 분기 → 로컬 디스크에서 읽음 | engineer |
| `apps/api/tests/test_recordings_mock_s3.py` | 신규 파일 | init/upload/validate end-to-end MOCK_S3 시나리오 + MOCK_S3=false 회귀 검증 | engineer |
| `.gitignore` | 1줄 추가 | `apps/api/static/uploads/` — mock PUT이 생성하는 사용자 업로드 디렉토리 추적 제외 | engineer |

> **[ENGINEER_SCOPE]**: 이 impl 실행 시 engineer는 아래 경로를 처리한다.
> - `apps/api/app/**`
> - `apps/api/tests/**`
> - `.gitignore` (루트, 1줄 추가만)
>
> 모바일 코드(`apps/mobile/**`) 무변경. `.env` 무변경(이미 `MOCK_S3=true` 설정 완료된 환경 가정 — #116에서 처리).

---

## 1. `apps/api/app/services/recording_service.py`

`init_upload()` Line 64 presigned PUT 발급 블록 앞에 MOCK_S3 분기 삽입.

```python
async def init_upload(
    db: AsyncSession,
    user_id: uuid.UUID,
    req: UploadInitRequest,
) -> UploadInitResponse:
    sample_id = uuid.uuid4()
    extension = "wav" if "wav" in req.content_type else "m4a"
    s3_key = f"{SAMPLE_S3_PREFIX}/{user_id}/{sample_id}.{extension}"

    sample = VoiceSample(
        id=sample_id,
        user_id=user_id,
        s3_key=s3_key,
        status="uploaded",
        created_at=datetime.now(timezone.utc),
    )
    db.add(sample)
    await db.commit()

    # ── MOCK_S3 분기 ───────────────────────────────────────────────
    if settings.MOCK_S3:
        # 클라이언트는 이 URL로 PUT — 서버가 raw body를 static/uploads/{s3_key} 에 저장
        # base_url 은 songs_service 와 동일 패턴 (#116). 환경 분리는 MOCK_S3 플래그 자체가 담당.
        base_url = "http://localhost:8000"
        upload_url = f"{base_url}/api/v1/_mock_s3/{s3_key}"
        logger.info(
            "recording.upload.init.mock",
            user_id=str(user_id),
            sample_id=str(sample_id),
            song_key=req.song_key,
            s3_key=s3_key,
        )
        return UploadInitResponse(
            sample_id=str(sample_id),
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in_seconds=0,   # mock — 만료 없음
        )
    # ── S3 presigned 분기 (기존 코드 유지) ──────────────────────────
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
        await db.delete(sample)
        await db.commit()
        logger.error("s3.presign.put.failed", user_id=str(user_id), error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="업로드 준비에 실패했어요. 잠시 후 다시 시도해주세요",
        )

    logger.info(
        "recording.upload.init",
        user_id=str(user_id),
        sample_id=str(sample_id),
        song_key=req.song_key,
    )

    return UploadInitResponse(
        sample_id=str(sample_id),
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in_seconds=SAMPLE_UPLOAD_EXPIRY,
    )
```

**결정 근거**:
- `expires_in_seconds=0` → #116과 동일한 mock 시그널.
- DB 레코드 생성은 분기와 무관하게 선행 → `_download_from_s3`/`complete_upload`가 동일한 `s3_key` 조회 가능.
- presigned 분기에서 ClientError 시 sample 삭제하던 보상 트랜잭션은 mock 분기엔 불필요(boto3 미호출).

---

## 2. `apps/api/app/api/v1/mock_s3.py` (신규)

```python
"""
MOCK_S3=true 개발 환경 전용 — S3 presigned PUT URL을 흉내내는 라우트.
프로덕션에는 등록되지 않는다(main.py에서 MOCK_S3 플래그로 include 분기).

동작:
- 클라이언트가 PUT /api/v1/_mock_s3/{path:path} 으로 raw body를 전송
- 서버가 apps/api/static/uploads/{path} 에 그대로 저장
- quality_check_service._download_from_s3 가 같은 경로에서 읽어 SNR 분석
"""
from __future__ import annotations

import pathlib

import structlog
from fastapi import APIRouter, Request, Response, status

logger = structlog.get_logger()

router = APIRouter(prefix="/_mock_s3", tags=["mock"])

# apps/api/static/uploads — main.py 가 /static 마운트 (MOCK_S3 분기와 무관하게 디렉토리 조건)
_STATIC_ROOT = pathlib.Path(__file__).parent.parent.parent.parent / "static"
_UPLOADS_ROOT = _STATIC_ROOT / "uploads"


@router.put("/{path:path}", status_code=status.HTTP_200_OK)
async def mock_s3_put(path: str, request: Request) -> Response:
    """
    presigned PUT 흉내 — Content-Type 검증 없음, 인증 없음(presigned URL은 원래 사용자 인증을 거치지 않음).
    경로 traversal 방어: path 에 ".." 포함 시 400.
    """
    if ".." in path or path.startswith("/"):
        return Response(status_code=status.HTTP_400_BAD_REQUEST)

    target = _UPLOADS_ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)

    body = await request.body()
    target.write_bytes(body)

    logger.info("mock_s3.put", path=path, size=len(body))
    return Response(status_code=status.HTTP_200_OK)
```

**결정 근거**:
- `path:path` 컨버터로 `samples/{uuid}/{uuid}.wav` 같은 슬래시 경로 수용.
- 인증 의도적으로 미설정 — 실제 S3 presigned URL도 인증 없이 동작. 클라이언트가 axios 인터셉터(JWT)를 우회하기 위해 `expo-file-system uploadAsync`로 호출하는 패턴(#123)과 동일 의미.
- ".." 방어로 디렉토리 탈출 차단. mock이지만 dev 환경 보안 최소선.

---

## 3. `apps/api/app/main.py`

router include 블록에 조건부 1줄 추가. `recordings_router` 다음 줄이 자연스러움:

```python
    app.include_router(recordings_router, prefix="/api/v1")
    if settings.MOCK_S3:
        from app.api.v1.mock_s3 import router as mock_s3_router
        app.include_router(mock_s3_router, prefix="/api/v1")
    app.include_router(rewarded_router, prefix="/api/v1")
```

**결정 근거**: 프로덕션(`MOCK_S3=false`)에서 `_mock_s3` 경로가 라우팅 테이블에 등록되지 않음 → 외부 요청 시 404. 임포트도 분기 안에서 수행해 미사용 코드 import 회피.

`StaticFiles` 마운트(`apps/api/static`)는 이미 #116에서 `/static`으로 잡혀 있으므로 추가 변경 불필요. `static/uploads/` 디렉토리는 mock_s3 라우트가 첫 PUT 시 생성한다. **`.gitignore`에 `apps/api/static/uploads/` 1줄 추가는 본 PR 범위에 포함**(SPEC_GAP #3 흡수 — 같은 PR에 두는 게 일관성·재현성 양쪽 모두 유리).

---

## 4. `apps/api/app/services/quality_check_service.py`

`_download_from_s3` 함수에 MOCK_S3 분기 추가. **`mock_s3.py`의 `_UPLOADS_ROOT`를 import해 단일 출처화** (SPEC_GAP #1 테스트 monkeypatch 단순화 용도):

```python
from app.api.v1.mock_s3 import _UPLOADS_ROOT as _MOCK_UPLOADS_ROOT  # 모듈 상단 import

async def _download_from_s3(s3_key: str) -> bytes:
    """S3/R2에서 샘플 다운로드 (asyncio executor로 boto3 동기 호출 래핑)."""

    if settings.MOCK_S3:
        # mock_s3 라우트가 저장한 로컬 파일을 그대로 반환 — 같은 _UPLOADS_ROOT 공유.
        target = _MOCK_UPLOADS_ROOT / s3_key
        if not target.exists():
            raise FileNotFoundError(f"mock upload not found: {s3_key}")
        return target.read_bytes()

    def _sync_download() -> bytes:
        client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            **({"endpoint_url": settings.S3_ENDPOINT_URL} if settings.S3_ENDPOINT_URL else {}),
        )
        response = client.get_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return response["Body"].read()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync_download)
```

**결정 근거**:
- 분기를 함수 첫 줄에 둬 boto3 호출 자체를 차단 → MOCK_S3=true 환경에 dummy AWS 키만 있어도 ClientError 안 남.
- `FileNotFoundError`는 상위 `validate_sample`의 `except Exception` 블록에서 잡혀 `fail_reason="s3_error"`로 변환됨 → 기존 실패 메시지 흐름 유지.
- `_UPLOADS_ROOT`를 `mock_s3` 모듈에서 import → 테스트가 한 곳만 monkeypatch하면 라우터 PUT/서비스 GET 양쪽이 같은 디렉토리를 본다. 함수 내부 pathlib 재계산 회피.

---

## 5. `apps/api/tests/test_recordings_mock_s3.py` (신규)

### 테스트 범위

| 케이스 | 검증 항목 |
|---|---|
| MOCK_S3=true, 인증된 사용자 | `init_upload` 응답의 `upload_url`이 `http://localhost:8000/api/v1/_mock_s3/samples/...` |
| MOCK_S3=true, 인증된 사용자 | 응답의 `expires_in_seconds == 0` |
| MOCK_S3=true | mock_s3 PUT 라우트가 200 + body가 `static/uploads/{key}`에 저장됨 |
| MOCK_S3=true | `_download_from_s3(s3_key)`가 PUT한 동일 바이트 반환 |
| MOCK_S3=true, 경로 traversal | `_mock_s3/../etc/passwd` PUT 시 400 |
| MOCK_S3=false | boto3 `generate_presigned_url` 호출됨 (#123 회귀 검증) |

### 픽스처 전제 (SPEC_GAP #1 흡수)

`apps/api/tests/conftest.py`는 **env-only**이며 `client` / `db_session` fixture가 없다. 새 테스트 파일은 `test_songs_preview.py`와 동일한 "직접 서비스 호출 + monkeypatch" 패턴을 따른다:

- **`db_session` 대체 → `AsyncMock`**: `init_upload`은 `db.add(sample)` / `await db.commit()`만 사용하고 ORM 결과를 다시 읽지 않음. 따라서 `unittest.mock.AsyncMock(spec=AsyncSession)` 으로 충분 (실 DB 연결 불요).
- **`client` 대체 → 인라인 `TestClient(app)`**: `mock_s3` 라우터의 HTTP 동작을 검증해야 하므로 테스트 함수 내부에서 `from fastapi.testclient import TestClient; client = TestClient(app)`을 즉석 생성. `MOCK_S3=true` 일 때만 라우터가 등록되므로 `monkeypatch`로 환경변수 세팅 후 **`importlib.reload(app.main)`** 또는 직접 `app.include_router(mock_s3_router, prefix="/api/v1")` 호출로 라우터를 주입한다 (engineer 판단으로 둘 중 단순한 쪽 선택).

### 비동기 통일 (SPEC_GAP #2 흡수)

`asyncio.get_event_loop().run_until_complete(...)`는 Python 3.10+에서 `DeprecationWarning`을 띄운다. 모든 비동기 호출(`init_upload`, `_download_from_s3`)은 **`@pytest.mark.asyncio` 데코레이터 + `async def`**로 일원화한다. `pytest-asyncio`가 `pyproject.toml` dev deps에 있는지 engineer가 확인 후 미존재 시 추가.

### 코드 스니펫

```python
import uuid
import pathlib
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.recording_service import init_upload
from app.services.quality_check_service import _download_from_s3
from app.schemas.recordings import UploadInitRequest


def _fake_db() -> AsyncMock:
    """init_upload가 쓰는 (db.add / await db.commit / await db.delete) 만 충족하는 AsyncSession 더블."""
    db = AsyncMock(spec=AsyncSession)
    db.add = MagicMock()           # add는 동기 메서드
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    return db


@pytest.fixture
def mock_s3_on(monkeypatch):
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", True)


@pytest.fixture
def mock_s3_off(monkeypatch):
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", False)


@pytest.mark.asyncio
async def test_init_upload_mock_s3_returns_local_url(mock_s3_on):
    user_id = uuid.uuid4()
    req = UploadInitRequest(song_key="brahms", file_size_bytes=1024, content_type="audio/wav")

    res = await init_upload(_fake_db(), user_id, req)

    assert res.upload_url.startswith("http://localhost:8000/api/v1/_mock_s3/samples/")
    assert res.upload_url.endswith(".wav")
    assert res.expires_in_seconds == 0
    assert res.s3_key.startswith(f"samples/{user_id}/")


@pytest.mark.asyncio
async def test_init_upload_mock_s3_false_calls_boto3(mock_s3_off):
    fake = MagicMock()
    fake.generate_presigned_url.return_value = "https://s3.example.com/x"

    user_id = uuid.uuid4()
    req = UploadInitRequest(song_key="brahms", file_size_bytes=1024, content_type="audio/wav")
    with patch("app.services.recording_service.boto3.client", return_value=fake):
        res = await init_upload(_fake_db(), user_id, req)

    assert res.upload_url == "https://s3.example.com/x"
    assert res.expires_in_seconds > 0
    fake.generate_presigned_url.assert_called_once()


@pytest.mark.asyncio
async def test_mock_s3_put_round_trip(mock_s3_on, tmp_path, monkeypatch):
    """PUT /_mock_s3/{key} 후 _download_from_s3로 동일 바이트 회수."""
    # static/uploads 루트를 tmp_path로 우회 (테스트 격리 — 실제 repo의 static/uploads 오염 방지).
    # mock_s3._UPLOADS_ROOT 한 곳만 갈아치우면 라우터 PUT 과 서비스 GET 양쪽이 같은 dir 사용
    # (quality_check_service 가 mock_s3._UPLOADS_ROOT 를 import 별칭으로 공유하기 때문).
    from app.api.v1 import mock_s3 as mock_s3_module
    monkeypatch.setattr(mock_s3_module, "_UPLOADS_ROOT", tmp_path)
    import app.services.quality_check_service as qc_module
    monkeypatch.setattr(qc_module, "_MOCK_UPLOADS_ROOT", tmp_path)

    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.v1.mock_s3 import router as mock_s3_router
    # MOCK_S3=true 시점에만 등록되는 라우터를 테스트용으로 강제 주입.
    if not any(getattr(r, "prefix", "") == "/api/v1/_mock_s3" for r in app.router.routes):
        app.include_router(mock_s3_router, prefix="/api/v1")
    client = TestClient(app)

    key = "samples/test-user/test-sample.wav"
    body = b"\x00" * 1024  # WAV stub

    res = client.put(f"/api/v1/_mock_s3/{key}", content=body, headers={"Content-Type": "audio/wav"})
    assert res.status_code == 200

    got = await _download_from_s3(key)
    assert got == body


@pytest.mark.asyncio
async def test_mock_s3_put_blocks_traversal(mock_s3_on, tmp_path, monkeypatch):
    from app.api.v1 import mock_s3 as mock_s3_module
    monkeypatch.setattr(mock_s3_module, "_UPLOADS_ROOT", tmp_path)

    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.v1.mock_s3 import router as mock_s3_router
    if not any(getattr(r, "prefix", "") == "/api/v1/_mock_s3" for r in app.router.routes):
        app.include_router(mock_s3_router, prefix="/api/v1")
    client = TestClient(app)

    res = client.put("/api/v1/_mock_s3/../etc/passwd", content=b"x")
    assert res.status_code == 400
```

> **engineer 판단 포인트**:
> 1. `_UPLOADS_ROOT` 를 `mock_s3.py` 모듈 상수로 두면 monkeypatch가 쉬움 (스니펫 가정). `quality_check_service._download_from_s3` 의 mock 분기도 동일 상수를 import 하는 패턴이면 테스트 monkeypatch 1회로 양쪽이 같은 디렉토리를 본다 — 강력 권장.
> 2. 만약 라우터 강제 주입 패턴이 다른 테스트 모듈과 충돌하면 (`app.router.routes` 영구 mutation), `TestClient` 컨텍스트 종료 후 라우터 제거 fixture를 추가하거나 별도 `FastAPI()` 인스턴스를 새로 만들어 라우터만 등록한 미니 앱으로 대체.

---

## 수용 기준 검증

| 기준 | 검증 방법 |
|---|---|
| MOCK_S3=true → POST `/api/v1/recordings/init` 응답 `upload_url`이 `http://localhost:8000/api/v1/_mock_s3/...` | `pytest test_recordings_mock_s3.py::test_init_upload_mock_s3_returns_local_url` |
| 클라이언트가 해당 URL로 PUT → 200, body가 디스크에 저장됨 | `pytest test_recordings_mock_s3.py::test_mock_s3_put_round_trip` |
| `quality_check_service._download_from_s3`가 boto3 호출 없이 동작 | `test_mock_s3_put_round_trip`의 download 호출 |
| MOCK_S3=false → boto3 분기 그대로 (#123 회귀 없음) | `pytest test_recordings_mock_s3.py::test_init_upload_mock_s3_false_calls_boto3` |
| Songs preview MOCK_S3 회귀 없음 (#116) | `pytest test_songs_preview.py` 전체 통과 |
| 실기기 검증: 녹음 → init → uploadToS3 → complete → validate → Generating 진입 | engineer 디바이스 수동 확인 |

---

## 주의사항

- `apps/api/static/uploads/` 디렉토리는 git-untracked가 적절. **`.gitignore` 1줄 추가는 본 PR 범위에 포함**(SPEC_GAP #3 흡수).
- `mock_s3_router`는 `MOCK_S3=true`일 때만 등록 → 프로덕션 배포 시 외부에서 `_mock_s3` 경로 접근 불가(404). 정적 분석 시 이 경로가 인증 없이 PUT을 받는다는 사실을 보안 리뷰 회피용으로 쓰지 말 것 — `MOCK_S3` 플래그가 dev/staging 한정 게이트.
- 모바일은 무변경. `recordings.ts:42-55`(uploadToS3)는 #123 그대로 동작 — `presignedUrl`이 mock URL이든 실 S3 URL이든 PUT의 의미가 동일하기 때문에 클라이언트가 분기 인지할 필요 없음.
- `expires_in_seconds=0`은 클라이언트가 만료 처리 스킵 시그널(#116 동일).
- 파일 미존재 시 `_download_from_s3`가 `FileNotFoundError`를 던져 `validate_sample`의 `except Exception` → `fail_reason="s3_error"`. 사용자 메시지: "파일을 읽을 수 없어요. 잠시 후 다시 시도해주세요" — 기존 메시지 매핑 유지.

## SPEC_GAP 흡수 요약 (2차 검증용)

| ID | validator 지적 | 본 plan 반영 위치 |
|---|---|---|
| SPEC_GAP #1 | `client` / `db_session` fixture 미존재 | Section 5 "픽스처 전제" 단락 + 코드 스니펫에서 `_fake_db()` AsyncMock + 인라인 `TestClient(app)` 패턴 명시 |
| SPEC_GAP #2 | `asyncio.get_event_loop().run_until_complete` deprecation | Section 5 모든 테스트를 `@pytest.mark.asyncio async def`로 일원화 |
| SPEC_GAP #3 | `.gitignore` 분리 → 같은 PR이 일관성 좋음 | Section "수정 파일 목록" / "[ENGINEER_SCOPE]" / Section 3 마지막 단락 / "주의사항"에 모두 포함 |

## 범위 외 (절대 변경 금지)

- `apps/mobile/**` — 모바일 무변경.
- `recordings_router` 라우트 시그니처/응답 스키마.
- `_s3_client()` / boto3 분기 — `MOCK_S3=false` 경로는 그대로.
- `songs_service.get_preview_url` (#116)의 분기 로직.
- `prd.md` / `trd.md` / 다른 docs.
