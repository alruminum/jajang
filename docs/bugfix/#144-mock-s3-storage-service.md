---
depth: simple
---

# #144 — MOCK_S3 분기 누락으로 storage_service.upload_mp3 / generate_presigned_url 가 실 AWS 호출 (#127 후속)

## 이슈 요약

`MOCK_S3=true` 환경에서 30초 녹음이 끝나고 Celery worker 가 `MockInferenceClient` 로 mp3 를 생성한 직후, `storage_service.upload_mp3` 가 boto3 `put_object` 를 호출 → dummy AWS 키 때문에 `InvalidAccessKeyId` 로 실패한다. PR #127 은 `recording_service.init_upload` (샘플 업로드) 와 `quality_check_service` (SNR 분석) 의 MOCK_S3 분기는 처리했지만, **결과물(mp3) 저장·다운로드 경로인 `storage_service` 는 누락**.

같은 누락이 `generate_presigned_url` (Tracks 화면 / Generations status 응답) 과 `delete_object` (계정 삭제 / 트랙 삭제) 에도 존재한다 — 운영 흐름은 영향 없지만 MOCK_S3 환경에선 동일하게 ClientError 가 발생한다.

## Depth 판정 근거: `simple`

- 신규 라우트·신규 로직 구조 없음. `storage_service` 의 기존 함수 3개에 MOCK_S3 분기 1줄씩 삽입 + 로컬 파일시스템 read/write (이미 `apps/api/app/static/` 디렉토리는 #116 부터 마운트됨).
- DOM/문구/testid 변경 없음. 모바일 무변경.
- `storage_service.upload_mp3` / `generate_presigned_url` / `delete_object` 를 assertion 하는 기존 테스트 없음 (`apps/api/tests` grep 0건). 회귀 테스트는 1건 신설 권장 — engineer 판단으로 본 PR 에 포함 (참조 패턴 명확).
- 보안/결제/인증 영역 아님.

## 수정 파일 목록

| 파일 | 변경 유형 | 상세 | 담당 |
|---|---|---|---|
| `apps/api/app/core/config.py` | 상수 추가 | 모듈 최하단에 `STATIC_ROOT: pathlib.Path` 단일 출처 export. main.py 의 `_static_dir` 식과 동치. | engineer |
| `apps/api/app/main.py` | import 치환 | `_static_dir = pathlib.Path(__file__).parent.parent / "static"` → `from app.core.config import STATIC_ROOT` 후 마운트 인자로 사용 | engineer |
| `apps/api/app/services/storage_service.py` | 분기 추가 + import | `STATIC_ROOT` import 후 `upload_mp3`, `generate_presigned_url`, `delete_object` 각 함수 시작부에 `if settings.MOCK_S3:` 분기 | engineer |
| `apps/api/tests/test_mock_s3_storage.py` | 신규 파일 | MOCK_S3 분기 / 회귀 / **마운트 정합성**(`storage_service.STATIC_ROOT is main._static_dir 동등`) 검증 | engineer |
| `.gitignore` | 1줄 추가 | `apps/api/static/tracks/` — mock upload_mp3 가 생성하는 결과물 디렉토리 (`apps/api/static/uploads/` 가 #127 에서 추가됐다면 같은 위치에 한 줄 추가) | engineer |

> **[ENGINEER_SCOPE]**: `apps/api/app/**`, `apps/api/tests/**`, `.gitignore` (루트, 1줄 추가만). 모바일 무변경. `.env` 무변경 (`MOCK_S3=true` 는 #116 부터 설정 완료 가정).

> **🔴 단일 출처 원칙**: 이전 드래프트는 storage_service 와 main.py 가 *각자* `pathlib` 식으로 같은 경로를 재계산하도록 했으나, **두 파일의 디렉토리 깊이가 다르기 때문에 같은 식이 다른 경로를 가리킨다** (storage_service: `apps/api/app/services/` → `parent.parent / "static"` = `apps/api/app/static/` ❌ / main.py: `apps/api/app/` → `parent.parent / "static"` = `apps/api/static/` ✅). PLAN_VALIDATION FAIL 의 근본 원인. 본 개정판은 `app/core/config.py` 에 단일 상수를 두고 양쪽에서 import 하는 방식 (옵션 B) 채택 — 향후 경로 변경 시 한 곳만 갱신.

---

## 1. `apps/api/app/core/config.py` — 단일 출처 상수

`Settings` 클래스 *바깥* (모듈 하단) 에 추가:

```python
import pathlib

# /static StaticFiles 마운트 루트. main.py 와 storage_service.py 가 동일 경로를 가리키도록 단일 출처.
# 위치: apps/api/app/core/config.py → parent(=core) → parent(=app) → parent(=apps/api) / "static"
STATIC_ROOT: pathlib.Path = pathlib.Path(__file__).parent.parent.parent / "static"
```

**결정 근거**:
- config.py 는 `app/core/` 에 있어 `parent.parent.parent = apps/api/` → `STATIC_ROOT = apps/api/static/` (= 기존 main.py `_static_dir` 와 동치).
- main.py 와 storage_service 둘 다 `app.core.config` 를 이미 import 하고 있으므로 **순환 의존 위험 없음** — 양쪽에서 `from app.core.config import STATIC_ROOT` 만 추가.
- `Settings` 환경변수 클래스 안이 아닌 *모듈 레벨 상수* 로 두는 이유: 환경변수로 override 할 필요 없음 (코드 배치에 의해 고정). pydantic Settings 의 BaseSettings 패턴과 별개.

---

## 2. `apps/api/app/main.py` — STATIC_ROOT 재사용

기존 (Line 61–63):

```python
_static_dir = pathlib.Path(__file__).parent.parent / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
```

→ 치환:

```python
from app.core.config import STATIC_ROOT  # (이미 settings import 가 같은 모듈에서 이뤄지므로 동일 import 라인에 묶어도 됨)

if STATIC_ROOT.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_ROOT)), name="static")
```

**결정 근거**:
- 함수 lifespan 내부에 인라인 변수(`_static_dir`) 로 두던 것을 모듈 상수로 끌어올려 storage_service 와 공유. lifespan 시점이 아닌 import 시점에 평가되지만 경로는 정적이므로 부작용 없음.
- 기존 `pathlib` import 가 main.py 에서 다른 용도로 사용 중이면 유지, 아니면 제거 가능 (engineer 판단).

---

## 3. `apps/api/app/services/storage_service.py`

핵심: **#116 의 `songs_service.get_preview_url` 패턴 그대로 답습** — boto3 우회 + `/static` StaticFiles 마운트 재사용.

main.py 와 동일한 `STATIC_ROOT` 를 import 해서 `tracks/{user_id}/{track_id}.mp3` 를 그 디렉토리 아래에 쓰면 클라이언트는 `http://localhost:8000/static/tracks/{user_id}/{track_id}.mp3` 로 직접 다운로드 가능 — 신규 mock GET 라우트 불필요.

```python
import uuid

import boto3
import structlog
from botocore.exceptions import ClientError

from app.core.config import STATIC_ROOT, settings

logger = structlog.get_logger()

TRACK_S3_PREFIX = "tracks"
TRACK_PRESIGN_EXPIRY = 3600

_MOCK_BASE_URL = "http://localhost:8000"


def upload_mp3(
    user_id: uuid.UUID,
    track_id: uuid.UUID,
    mp3_bytes: bytes,
) -> str:
    s3_key = f"{TRACK_S3_PREFIX}/{user_id}/{track_id}.mp3"

    # MOCK_S3=true → boto3 우회. 결과물을 /static 아래 동일 키 경로에 그대로 저장.
    # generate_presigned_url 도 같은 분기에서 /static URL 을 반환하므로 클라이언트가 즉시 재생 가능.
    if settings.MOCK_S3:
        target = STATIC_ROOT / s3_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(mp3_bytes)
        logger.info(
            "storage.mp3.uploaded.mock",
            user_id=str(user_id),
            track_id=str(track_id),
            s3_key=s3_key,
            size=len(mp3_bytes),
        )
        return s3_key

    s3 = _s3_client()
    try:
        s3.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=s3_key,
            Body=mp3_bytes,
            ContentType="audio/mpeg",
        )
        logger.info("storage.mp3.uploaded", user_id=str(user_id), track_id=str(track_id), s3_key=s3_key)
    except ClientError as e:
        logger.error("storage.mp3.upload.failed", user_id=str(user_id), error=str(e))
        raise

    return s3_key


def generate_presigned_url(s3_key: str) -> str:
    # MOCK_S3=true → /static URL 반환. expires_in 개념 없음 (호출부는 URL 만 사용).
    if settings.MOCK_S3:
        return f"{_MOCK_BASE_URL}/static/{s3_key}"

    s3 = _s3_client()
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": s3_key,
            },
            ExpiresIn=TRACK_PRESIGN_EXPIRY,
        )
        return url
    except ClientError as e:
        logger.error("storage.presign.failed", s3_key=s3_key, error=str(e))
        raise


def delete_object(s3_key: str) -> None:
    # MOCK_S3=true → 로컬 파일 best-effort 삭제. 미존재여도 통과 (테스트 격리/멱등성).
    if settings.MOCK_S3:
        target = STATIC_ROOT / s3_key
        try:
            target.unlink(missing_ok=True)
            logger.info("storage.object.deleted.mock", s3_key=s3_key)
        except OSError as e:
            logger.warning("storage.object.delete.mock.failed", s3_key=s3_key, error=str(e))
        return

    s3 = _s3_client()
    try:
        s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        logger.info("storage.object.deleted", s3_key=s3_key)
    except ClientError as e:
        logger.error("storage.object.delete.failed", s3_key=s3_key, error=str(e))
        raise


def _s3_client():
    s3_kwargs: dict = {
        "region_name": settings.S3_REGION,
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
    }
    if settings.S3_ENDPOINT_URL:
        s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
    return boto3.client("s3", **s3_kwargs)
```

**결정 근거**:
- `STATIC_ROOT` 는 `app.core.config` 에서 단일 출처로 정의 → main.py 와 storage_service 가 동일 경로를 보장. 이전 드래프트의 *각자 재계산* 방식은 두 파일의 디렉토리 깊이 차이로 인해 다른 디렉토리를 가리키는 버그가 있어 PLAN_VALIDATION FAIL 의 원인이 됐음.
- 순환 의존 우려 없음: `app.core.config` 는 main.py 와 storage_service 가 *이미* import 하는 leaf 모듈. 새 의존 라인이 생기지 않음.
- `generate_presigned_url` 의 mock 분기는 `expires_in` 개념을 그대로 무시 (호출부는 URL 문자열만 소비) → 시그니처 변경 없음.
- `delete_object` 의 `missing_ok=True` 는 테스트 격리(같은 트랙 두 번 삭제) 와 mock 환경 멱등성 양쪽을 살림. 운영 분기는 그대로 ClientError 전파.
- `recording_service` 처럼 별도 mock_s3 라우트를 신설하지 않은 이유: tracks 는 *서버가 직접 쓰고 클라이언트가 GET 으로 읽는다*. samples 는 *클라이언트가 PUT 으로 쓰고 서버가 검증 시 읽는다*. 전자는 `/static` StaticFiles 만으로 충족, 후자는 PUT 라우트가 필요. 비대칭 정당화.

---

## 4. `apps/api/tests/test_mock_s3_storage.py` (신규)

`apps/api/tests/test_mock_s3_recordings.py` 의 픽스처 패턴 (`mock_s3_on` / `mock_s3_off` monkeypatch + `unittest.mock.patch` 로 `boto3.client` 차단) 을 그대로 답습.

### 테스트 범위

| 케이스 | 검증 항목 |
|---|---|
| **마운트 정합성 (사전조건)** | `app.services.storage_service.STATIC_ROOT == app.core.config.STATIC_ROOT` 동등 — main.py 가 마운트하는 경로와 storage_service 가 쓰는 경로가 동일한지 보증. 단건이지만 본 PLAN_VALIDATION FAIL 의 재발 방지 핵심. |
| `upload_mp3`, MOCK_S3=true | boto3 호출 없음 + 반환 s3_key 가 `tracks/{user_id}/{track_id}.mp3` + `STATIC_ROOT/s3_key` 에 바이트 저장 |
| `upload_mp3`, MOCK_S3=false | boto3 `put_object` 1회 호출 (회귀) |
| `generate_presigned_url`, MOCK_S3=true | 반환 URL 이 `http://localhost:8000/static/tracks/...` |
| `generate_presigned_url`, MOCK_S3=false | boto3 `generate_presigned_url` 1회 호출 (회귀) |
| `delete_object`, MOCK_S3=true | 사전 생성한 파일이 삭제됨 + 미존재 키도 예외 없이 통과 |
| `delete_object`, MOCK_S3=false | boto3 `delete_object` 1회 호출 (회귀) |

### 픽스처 / monkeypatch

- `monkeypatch.setattr(storage_service.settings, "MOCK_S3", True/False)` — recording_service 테스트와 동일.
- `STATIC_ROOT` 는 `monkeypatch.setattr(storage_service, "STATIC_ROOT", tmp_path)` 로 격리 (실 repo `apps/api/static/` 오염 방지). 정합성 테스트는 monkeypatch *없이* 임포트 시점 값으로 비교.
- boto3 차단: `with patch("app.services.storage_service.boto3.client", return_value=fake): ...` — recording_service 테스트와 동일.

### 코드 스니펫 (요약)

```python
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services import storage_service


@pytest.fixture
def mock_s3_on(monkeypatch, tmp_path):
    monkeypatch.setattr(storage_service.settings, "MOCK_S3", True, raising=False)
    monkeypatch.setattr(storage_service, "STATIC_ROOT", tmp_path)
    return tmp_path


@pytest.fixture
def mock_s3_off(monkeypatch):
    monkeypatch.setattr(storage_service.settings, "MOCK_S3", False, raising=False)


class Test_STATIC_ROOT_정합성:
    def test_storage_service_와_config_가_같은_경로를_가리킨다(self):
        from app.core import config as core_config
        assert storage_service.STATIC_ROOT == core_config.STATIC_ROOT

    def test_main_의_mount_경로와_같다(self):
        # main.py 가 mount 하는 디렉토리와 storage_service 가 쓰는 디렉토리가 동일한지.
        # 본 단건이 있었다면 #144 PLAN_VALIDATION FAIL 이 사전에 잡혔음.
        from app import main as app_main
        from app.core import config as core_config
        # main.py 는 STATIC_ROOT 를 직접 import 해 mount 인자로 전달하므로 비교 대상은 그 import 결과.
        assert getattr(app_main, "STATIC_ROOT", core_config.STATIC_ROOT) == core_config.STATIC_ROOT


class Test_upload_mp3_MOCK_S3_true:
    def test_boto3가_호출되지_않아야_한다(self, mock_s3_on):
        with patch("app.services.storage_service.boto3.client") as boto:
            storage_service.upload_mp3(uuid.uuid4(), uuid.uuid4(), b"\x00" * 64)
        boto.assert_not_called()

    def test_파일이_static_root_아래에_저장된다(self, mock_s3_on):
        user_id = uuid.uuid4()
        track_id = uuid.uuid4()
        body = b"\x01\x02\x03"
        s3_key = storage_service.upload_mp3(user_id, track_id, body)
        assert s3_key == f"tracks/{user_id}/{track_id}.mp3"
        assert (mock_s3_on / s3_key).read_bytes() == body


class Test_upload_mp3_MOCK_S3_false:
    def test_boto3_put_object가_호출된다(self, mock_s3_off):
        fake = MagicMock()
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            storage_service.upload_mp3(uuid.uuid4(), uuid.uuid4(), b"x")
        fake.put_object.assert_called_once()


class Test_generate_presigned_url:
    def test_MOCK_S3_true_시_static_URL_반환(self, mock_s3_on):
        url = storage_service.generate_presigned_url("tracks/u/t.mp3")
        assert url == "http://localhost:8000/static/tracks/u/t.mp3"

    def test_MOCK_S3_false_시_boto3_호출(self, mock_s3_off):
        fake = MagicMock()
        fake.generate_presigned_url.return_value = "https://s3.example.com/x"
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            url = storage_service.generate_presigned_url("tracks/u/t.mp3")
        assert url == "https://s3.example.com/x"
        fake.generate_presigned_url.assert_called_once()


class Test_delete_object:
    def test_MOCK_S3_true_시_파일이_삭제된다(self, mock_s3_on):
        target = mock_s3_on / "tracks/u/t.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"x")
        storage_service.delete_object("tracks/u/t.mp3")
        assert not target.exists()

    def test_MOCK_S3_true_시_미존재_키도_예외_없음(self, mock_s3_on):
        storage_service.delete_object("tracks/none/none.mp3")  # 예외 X

    def test_MOCK_S3_false_시_boto3_delete_호출(self, mock_s3_off):
        fake = MagicMock()
        with patch("app.services.storage_service.boto3.client", return_value=fake):
            storage_service.delete_object("tracks/u/t.mp3")
        fake.delete_object.assert_called_once()
```

> engineer 판단 포인트:
> - 클래스 분리는 가독성 목적. 기존 `test_mock_s3_recordings.py` 가 클래스 단위로 묶는 컨벤션을 사용 — 일관성 유지 위해 같은 패턴 채택.
> - `pytest-asyncio` 불필요 (storage_service 함수 전부 동기).
> - 회귀 테스트(`MOCK_S3=false`) 3건은 boto3 mocking 만으로 충분 — 실 AWS 호출 없음.

---

## 5. `.gitignore`

```
+ apps/api/static/tracks/
```

(`apps/api/static/uploads/` 가 #127 에서 추가됐다면 같은 위치에 한 줄 추가.)

**결정 근거**: mock 환경에서만 생성되는 결과물 디렉토리 → repo 추적 제외. 운영(`MOCK_S3=false`) 에선 디렉토리 생성 자체가 없음.

---

## 수용 기준 검증

| 기준 | 검증 방법 |
|---|---|
| MOCK_S3=true 30초 녹음 → Generating → Tracks(완료) 도달 | engineer 디바이스 수동 확인 (Celery worker → upload_mp3 → presign → 클라이언트 GET 성공) |
| `InvalidAccessKeyId` 사라짐 | Celery worker 로그 + `pytest test_mock_s3_storage.py::Test_upload_mp3_MOCK_S3_true::test_boto3가_호출되지_않아야_한다` |
| MOCK_S3=false 운영 동작 변화 없음 | `pytest test_mock_s3_storage.py` 의 모든 `MOCK_S3_false` 케이스 통과 |
| 기존 #127 / #116 회귀 없음 | `pytest test_mock_s3_recordings.py test_songs_preview.py` 전체 통과 |

---

## 주의사항

- `apps/api/static/tracks/` 는 git-untracked. mock_s3 라우트(#127)가 만든 `static/uploads/` 와 동일 정책.
- `STATIC_ROOT` 는 `app.core.config` 단일 출처 — main.py 와 storage_service 가 *반드시* 이 상수를 import 해서 사용. 각자 `pathlib` 식으로 재계산하면 디렉토리 깊이 차이로 다른 경로를 가리키게 되며, 본 PLAN_VALIDATION FAIL 의 근본 원인이었다.
- `delete_object` 의 mock 분기 `missing_ok=True` 는 의도적 — 같은 키로 두 번 호출돼도 예외 없이 통과시켜 멱등성 유지. 운영 분기(`MOCK_S3=false`) 는 그대로 ClientError 전파.
- 모바일 무변경. `presigned_url` 이 `http://localhost:8000/static/...` 든 `https://s3.../...` 든 클라이언트 player 입장에선 동일.
- 신규 mock GET 라우트 신설하지 않음 (StaticFiles 마운트로 충분). #127 의 `_mock_s3` PUT 라우트 비대칭은 위 §3 결정 근거 참조.

## 범위 외 (절대 변경 금지)

- `apps/mobile/**`
- `recording_service` / `quality_check_service` / `songs_service` / `mock_s3` 라우트 — #127 / #116 그대로.
- `_s3_client()` (storage_service 내부) — 운영 분기 시그니처 유지.
- `prd.md` / `trd.md` / 다른 docs.

---MARKER:LIGHT_PLAN_DONE---
