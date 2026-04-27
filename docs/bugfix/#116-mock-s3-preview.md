---
depth: std
---

# #116 — S07 SongSelect 미리듣기 무음 버그 픽스 (MOCK_S3 미구현 + .mp3/.wav 불일치)

## 이슈 요약

`MOCK_GPU`와 대칭되는 `MOCK_S3` 환경 변수가 미구현 상태이고, `preview_s3_key` 확장자가 `.mp3`로 잘못 선언돼 있으며, `StaticFiles` 마운트도 없어 로컬 개발 환경에서 미리듣기 URL이 404 반환 또는 boto3 presigned fail → 클라이언트 무음.

## SPEC_GAP 해결 이력 (attempt-0)

| 갭 | 원인 | 해결 방법 |
|---|---|---|
| `apps/api/tests/` 경로 미허용 | engineer 기본 allowed paths에 `tests/` 미포함 | 아래 **[ENGINEER_SCOPE]** 선언으로 경로 명시 → engineer가 재실행 시 이 경로를 허용 |
| `apps/api/.env` 수정 불가 | `.env`는 git-untracked 로컬 파일, engineer 자동화 대상 아님 | `.env` 항목을 **개발자 수동 액션**으로 이동. engineer 구현 범위에서 제거 |

> **[ENGINEER_SCOPE]**: 이 impl 실행 시 engineer는 아래 경로를 포함하여 처리한다.
> - `apps/api/app/**` (기존)
> - `apps/mobile/src/**` (기존)
> - `apps/api/tests/**` ← **추가** (테스트 신규 생성 포함)
>
> `.env` 수정은 engineer 범위 외. "개발자 수동 액션" 섹션 참조.

## 수정 파일 목록

| 파일 | 변경 유형 | 상세 | 담당 |
|---|---|---|---|
| `apps/api/app/core/config.py` | 필드 추가 | `MOCK_S3: bool = False` | engineer |
| `apps/api/app/main.py` | 마운트 추가 | `StaticFiles` `/static` 경로 | engineer |
| `apps/api/app/services/songs_service.py` | 값 수정 + 로직 추가 | `.mp3`→`.wav` 6곳 · `get_preview_url` MOCK_S3 분기 | engineer |
| `apps/api/tests/test_songs_preview.py` | 신규 파일 | MOCK_S3 분기 pytest 커버 | engineer |
| `apps/api/.env` | 환경변수 추가 | `MOCK_S3=true` | **개발자 수동** |

---

## 1. `apps/api/app/core/config.py`

`MOCK_GPU` 블록 아래에 `MOCK_S3` 필드 추가.

```python
# Storage — mock (개발환경 S3 우회)
MOCK_S3: bool = False   # true 시 boto3 skip → 로컬 /static/previews/ URL 반환
```

삽입 위치: `S3_PREVIEW_EXPIRY_SECONDS` 바로 위 (또는 GPU 분기 블록 끝 다음).

---

## 2. `apps/api/app/main.py`

### 추가 import

```python
from fastapi.staticfiles import StaticFiles
import pathlib
```

### 마운트 코드

`create_app()` 함수에서 router include 블록 **이후**, `return app` **이전**에 삽입:

```python
# 로컬 개발 환경 정적 파일 서빙 (MOCK_S3=true 시 미리듣기 음원)
_static_dir = pathlib.Path(__file__).parent.parent.parent / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")
```

**결정 근거**: 디렉토리 존재 여부로 조건 분기 → 프로덕션 환경(실제 S3 사용, `/static` 없음)에서 마운트가 누락돼도 기동 에러 없음. `MOCK_S3` 플래그와는 별도로 물리 디렉토리 기반 조건을 쓰는 이유는 마운트 자체가 해가 없기 때문 (프로덕션엔 `/static/previews/` 음원이 없어 마운트해도 404가 날 뿐).

**`_static_dir` 경로**: `apps/api/app/main.py` 기준으로 `..` × 3 → `apps/api/static`.

---

## 3. `apps/api/app/services/songs_service.py`

### 3-1. `SONGS` 상수 — `.mp3` → `.wav` 일괄 변경 (6곳)

```python
SONGS: list[SongMeta] = [
    SongMeta("brahms",   "브람스 자장가",      "Brahms' Lullaby",    "요하네스 브람스", 180, "previews/brahms_preview.wav"),
    SongMeta("mozart",   "모차르트 자장가",     "Mozart's Lullaby",   "볼프강 모차르트", 150, "previews/mozart_preview.wav"),
    SongMeta("schubert", "슈베르트 자장가",     "Schubert's Lullaby", "프란츠 슈베르트", 200, "previews/schubert_preview.wav"),
    SongMeta("twinkle",  "반짝반짝 작은 별",    "Twinkle Twinkle",    "전통 민요",       120, "previews/twinkle_preview.wav"),
    SongMeta("rockabye", "자장자장 (영)",       "Rock-a-bye Baby",    "전통 민요",       130, "previews/rockabye_preview.wav"),
    SongMeta("hush",     "허쉬 리틀 베이비",    "Hush Little Baby",   "전통 민요",       140, "previews/hush_preview.wav"),
]
```

### 3-2. `get_preview_url` — MOCK_S3 분기 추가

현재 함수 전체를 아래로 교체:

```python
def get_preview_url(song_key: str) -> PreviewUrlResponse:
    """
    MOCK_S3=True → 로컬 /static/previews/{key}_preview.wav URL 반환 (boto3 skip).
    MOCK_S3=False → S3 presigned GET URL 발급 (기존 동작, 프로덕션 회귀 없음).
    존재하지 않는 song_key → ValueError.
    S3 ClientError → 상위로 전파 (라우터에서 500 처리).
    """
    if song_key not in SONGS_BY_KEY:
        raise ValueError(f"Unknown song_key: {song_key}")

    meta = SONGS_BY_KEY[song_key]

    # ── MOCK_S3 분기 ──────────────────────────────────────────────────────────
    if settings.MOCK_S3:
        from app.core.config import settings as _s  # 순환 방지용 지역 alias (이미 임포트됨)
        # BASE_URL은 API 서버 주소 — 개발 환경 기본값 localhost:8000
        base_url = "http://localhost:8000"
        local_url = f"{base_url}/static/{meta.preview_s3_key}"
        return PreviewUrlResponse(
            song_key=song_key,
            preview_url=local_url,
            expires_in_seconds=0,   # mock이므로 만료 없음
        )
    # ── S3 presigned 분기 (기존 코드) ──────────────────────────────────────────
    expiry = settings.S3_PREVIEW_EXPIRY_SECONDS

    s3_kwargs: dict = {
        "region_name": settings.S3_REGION,
        "aws_access_key_id": settings.S3_ACCESS_KEY,
        "aws_secret_access_key": settings.S3_SECRET_KEY,
    }
    if settings.S3_ENDPOINT_URL:
        s3_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL

    s3_client = boto3.client("s3", **s3_kwargs)
    url: str = s3_client.generate_presigned_url(
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

**결정 근거**: 분기를 서비스 레이어에서 처리해 라우터·스키마를 무수정 유지. `expires_in_seconds=0`은 mock URL이 만료 없음을 명시하며 클라이언트에서 캐시 무효화 로직을 방지. `settings` 재임포트는 이미 모듈 최상단에 임포트돼 있어 실제로 불필요 — 지역 alias 코멘트는 삭제해도 무방.

---

## 4. `apps/api/.env`

`MOCK_GPU=true` 아래에 삽입:

```
MOCK_S3=true
```

---

## 5. `apps/api/tests/test_songs_preview.py` (신규)

### 테스트 범위

| 케이스 | 검증 항목 |
|---|---|
| MOCK_S3=true, 유효 key | `preview_url`이 `http://localhost:8000/static/previews/{key}_preview.wav` |
| MOCK_S3=true, 유효 key | `expires_in_seconds == 0` |
| MOCK_S3=false, 유효 key | boto3 `generate_presigned_url` 호출됨 (mock 확인) |
| 무효 key | `ValueError` 발생 |

### 코드 스니펫

```python
import pytest
from unittest.mock import patch, MagicMock

from app.services.songs_service import get_preview_url


@pytest.mark.parametrize("song_key", ["brahms", "mozart", "schubert", "twinkle", "rockabye", "hush"])
def test_mock_s3_returns_local_wav_url(song_key, monkeypatch):
    """MOCK_S3=true 시 /static/previews/{key}_preview.wav URL을 반환해야 한다."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", True)

    result = get_preview_url(song_key)

    assert result.preview_url == f"http://localhost:8000/static/previews/{song_key}_preview.wav"
    assert result.expires_in_seconds == 0
    assert result.song_key == song_key


def test_mock_s3_false_calls_boto3(monkeypatch):
    """MOCK_S3=false 시 boto3 presigned URL을 발급해야 한다."""
    from app.core import config as cfg_module
    monkeypatch.setattr(cfg_module.settings, "MOCK_S3", False)

    fake_url = "https://s3.example.com/presigned"
    mock_s3 = MagicMock()
    mock_s3.generate_presigned_url.return_value = fake_url

    with patch("app.services.songs_service.boto3.client", return_value=mock_s3):
        result = get_preview_url("brahms")

    assert result.preview_url == fake_url
    mock_s3.generate_presigned_url.assert_called_once()


def test_invalid_song_key_raises():
    """존재하지 않는 song_key는 ValueError를 발생시켜야 한다."""
    with pytest.raises(ValueError, match="Unknown song_key"):
        get_preview_url("nonexistent")
```

---

## 수용 기준 검증

| 기준 | 검증 방법 |
|---|---|
| `MOCK_S3=true` → GET `/api/v1/songs/brahms/preview` → `http://localhost:8000/static/previews/brahms_preview.wav` | `pytest test_songs_preview.py::test_mock_s3_returns_local_wav_url` |
| 해당 URL 직접 fetch → 200 + `audio/wav` | `curl http://localhost:8000/static/previews/brahms_preview.wav -I` |
| `MOCK_S3=false` → boto3 presigned 분기 그대로 | `pytest test_songs_preview.py::test_mock_s3_false_calls_boto3` |
| `pytest apps/api/tests` 전체 통과 | CI |

## 개발자 수동 액션 (engineer 범위 외)

`.env`는 git-untracked 로컬 파일이므로 engineer 자동화 범위에서 제외한다.
**개발자가 직접** 아래 줄을 `apps/api/.env`에 추가한다:

```
MOCK_S3=true
```

팀 공유 시 `apps/api/.env.example`에도 `MOCK_S3=false` (기본값) 추가 권장.

---

## 주의사항

- `.env`는 git-tracked가 아니므로 위 "개발자 수동 액션" 섹션 참조. engineer는 수정하지 않는다.
- `StaticFiles` 마운트는 `create_app()` 내 router include **이후** 위치해야 함 — 순서 틀리면 `/static` 라우터가 API 라우터를 가림.
- `expires_in_seconds=0`은 클라이언트(mobile)가 별도 만료 처리를 하지 않아도 되도록 명시적 mock 시그널. 향후 mock URL 만료 처리가 필요하면 음수(-1)를 sentinel로 사용 권장.
- 프로덕션(`MOCK_S3=false`) 배포 시 실제 `.wav` 파일이 S3 `previews/` 경로에 존재해야 함 — 기존 `.mp3` 키로 업로드된 파일이 있다면 재업로드 또는 복사 필요.
