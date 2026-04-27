---
depth: std
---
# impl: #116 SongSelect 미리듣기 무음 — MOCK_S3 분기 + 확장자 불일치 수정

## 근본 원인 요약

| # | 원인 | 파일 |
|---|---|---|
| 1 | `MOCK_S3` 필드 미존재 → `AttributeError` 잠재 | `config.py` |
| 2 | `preview_s3_key` 확장자 `.mp3` / 실제 파일 `.wav` 불일치 | `songs_service.py` |
| 3 | `StaticFiles` 마운트 없음 → `/static/previews/*` 404 | `main.py` |
| 4 | 로컬 `.env`에 `MOCK_S3=true` 미설정 | `.env` (메인 운영자 수동 단계 — engineer 범위 외) |

---

## 수정 파일 목록

| 파일 | 변경 유형 | 상세 |
|---|---|---|
| `apps/api/app/core/config.py` | 필드 추가 | `MOCK_S3: bool = False` |
| `apps/api/app/main.py` | StaticFiles 마운트 추가 | `/static` → `apps/api/static/` |
| `apps/api/app/services/songs_service.py` | 값 변경 + 분기 신설 | `.mp3`→`.wav` 6곡, MOCK_S3 early-return |
| `apps/api/tests/test_songs_preview.py` | 테스트 신설 | MOCK_S3 분기·404·목록 케이스 |

> ⚠️ **engineer 범위 외 (메인 운영자 수동 단계)**:
> - `apps/api/.env` — `.env` 는 실 JWT RSA private key 보유 + `.gitignore` 등록 → engineer 화이트리스트 영구 제외 (보안 정책). 머지 후 메인 운영자가 로컬에 `MOCK_S3=true` 한 줄 직접 append.
> - `apps/api/.env.example` — 다른 시크릿 키 인접 + agent 화이트리스트에 포함되지 않음 → 메인 운영자가 동일하게 `MOCK_S3=true` 행 추가 후 별도 commit.

---

## 상세 변경 명세

### 1. `apps/api/app/core/config.py`

`Settings` 클래스 내 `# Storage — presigned URL` 블록 바로 위에 추가:

```python
# S3 Mock 분기 (개발환경 로컬 static 파일 반환)
MOCK_S3: bool = False
```

**위치**: Line 44 위 (기존 `S3_PREVIEW_EXPIRY_SECONDS` 바로 위).  
**이유**: `MOCK_GPU`와 동일한 패턴 — 개발환경 기본값 False, `.env`에서 True 재정의.

---

### 2. `apps/api/app/main.py`

`create_app()` 함수 내, 라우터 include 블록 이전에 StaticFiles 마운트 추가.

```python
from fastapi.staticfiles import StaticFiles
import os

# StaticFiles 마운트 — MOCK_S3 분기용 로컬 미리듣기 파일 서빙
_static_dir = os.path.join(os.path.dirname(__file__), "..", "..", "static")
app.mount("/static", StaticFiles(directory=_static_dir), name="static")
```

**주의사항**:
- `static/` 디렉토리는 `apps/api/static/` — `main.py` 위치(`apps/api/app/main.py`)에서 `../../static` 경로.
- `mount` 호출은 `include_router` 이전에 배치해야 경로 충돌 없음.
- StaticFiles는 FastAPI 내장 (`fastapi.staticfiles`), 별도 패키지 불필요.

**수용 기준**: `GET http://localhost:8000/static/previews/brahms_preview.wav` → 200 + `audio/wav`.

---

### 3. `apps/api/app/services/songs_service.py`

#### 3-a. `SONGS` 상수 — `.mp3` → `.wav` 일괄 변경 (6곡)

```python
SONGS: list[SongMeta] = [
    SongMeta("brahms",   "브람스 자장가",    "Brahms' Lullaby",   "요하네스 브람스", 180, "previews/brahms_preview.wav"),
    SongMeta("mozart",   "모차르트 자장가",  "Mozart's Lullaby",  "볼프강 모차르트", 150, "previews/mozart_preview.wav"),
    SongMeta("schubert", "슈베르트 자장가",  "Schubert's Lullaby","프란츠 슈베르트", 200, "previews/schubert_preview.wav"),
    SongMeta("twinkle",  "반짝반짝 작은 별", "Twinkle Twinkle",   "전통 민요",       120, "previews/twinkle_preview.wav"),
    SongMeta("rockabye", "자장자장 (영)",    "Rock-a-bye Baby",   "전통 민요",       130, "previews/rockabye_preview.wav"),
    SongMeta("hush",     "허쉬 리틀 베이비", "Hush Little Baby",  "전통 민요",       140, "previews/hush_preview.wav"),
]
```

#### 3-b. `get_preview_url` — MOCK_S3 early-return 분기 추가

기존 boto3 로직 전 앞에 삽입:

```python
def get_preview_url(song_key: str) -> PreviewUrlResponse:
    if song_key not in SONGS_BY_KEY:
        raise ValueError(f"Unknown song_key: {song_key}")

    meta = SONGS_BY_KEY[song_key]
    expiry = settings.S3_PREVIEW_EXPIRY_SECONDS

    # MOCK_S3 분기 — 개발환경에서 boto3 없이 로컬 static URL 반환
    if settings.MOCK_S3:
        local_url = f"http://localhost:8000/static/{meta.preview_s3_key}"
        return PreviewUrlResponse(
            song_key=song_key,
            preview_url=local_url,
            expires_in_seconds=expiry,
        )

    # 이하 기존 boto3 presigned URL 로직 (변경 없음)
    s3_kwargs: dict = { ... }
    ...
```

**이유**: `MOCK_S3=False` 기본값이므로 프로덕션 boto3 경로는 전혀 변경되지 않음. early-return으로 분기 명확화.

---

### 4. `apps/api/tests/test_songs_preview.py` (신설)

```python
"""
Songs preview endpoint 테스트.
MOCK_S3=True 환경에서 로컬 URL 반환 여부 + 404 케이스 검증.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.deps import require_auth

client = TestClient(app)

AUTH_HEADER = {"Authorization": "Bearer test-token"}


def _authed_get(path: str):
    """
    FastAPI dependency_overrides로 require_auth를 bypass.

    [왜 dependency_overrides를 쓰는가]
    songs.py는 `from app.api.deps import require_auth`로 함수 객체를 임포트한 뒤
    `Depends(require_auth)`로 라우터에 등록한다. FastAPI는 라우터 등록 시점에
    함수 객체 레퍼런스를 캡처하므로, `patch("app.api.deps.require_auth")` 또는
    `patch("app.api.v1.songs.require_auth")`로 모듈 속성만 교체해도 이미 캡처된
    레퍼런스엔 영향이 없어 의존성 교체가 불가능하다.
    dependency_overrides는 함수 객체를 키로 런타임 조회하므로 항상 동작한다.
    """
    app.dependency_overrides[require_auth] = lambda: "test-user"
    try:
        return client.get(path, headers=AUTH_HEADER)
    finally:
        app.dependency_overrides.clear()


class TestSongsPreviewMockS3:
    """MOCK_S3=True 분기 검증."""

    def test_brahms_preview_returns_local_url(self, monkeypatch):
        monkeypatch.setattr("app.services.songs_service.settings.MOCK_S3", True)
        resp = _authed_get("/api/v1/songs/brahms/preview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["song_key"] == "brahms"
        assert "static/previews/brahms_preview.wav" in data["preview_url"]

    def test_all_songs_have_wav_preview_key(self):
        """6곡 전부 .wav 키를 가지는지 SONGS 상수 단위 검증 — 네트워크 불필요."""
        from app.services.songs_service import SONGS
        for song in SONGS:
            assert song.preview_s3_key.endswith(".wav"), (
                f"{song.key}: preview_s3_key가 .wav여야 함, 실제={song.preview_s3_key}"
            )

    def test_unknown_song_key_returns_404(self):
        resp = _authed_get("/api/v1/songs/nonexistent/preview")
        assert resp.status_code == 404

    def test_songs_list_returns_six_songs(self):
        resp = _authed_get("/api/v1/songs")
        assert resp.status_code == 200
        assert len(resp.json()["songs"]) == 6
```

**커버 케이스**:
- MOCK_S3=True → 로컬 URL (`.wav` 포함)
- 6곡 전부 `.wav` 확장자 상수 검증 (순수 단위 테스트, monkeypatch 불필요)
- 존재하지 않는 song_key → 404
- 목록 6곡 응답

**SPEC_GAP 수정 내역** (Plan Validation FAIL 반영):
- `patch("app.api.deps.require_auth", ...)` 제거 — songs.py 로컬 바인딩을 교체하지 못해 401 반환
- `app.dependency_overrides[require_auth] = lambda: "test-user"` 로 교체 — FastAPI 런타임 의존성 조회 경로와 일치
- `test_all_songs_have_wav_preview_key`에서 불필요한 `monkeypatch` 매개변수 제거 (순수 상수 검증이므로 해당 없음)

---

## 구현 순서 권고

```
[engineer 범위]
1. config.py — MOCK_S3 필드 추가
2. songs_service.py — .mp3→.wav + MOCK_S3 분기
3. main.py — StaticFiles 마운트
4. tests/test_songs_preview.py — 테스트 신설
5. pytest apps/api/tests 로컬 실행 확인

[메인 운영자 수동 단계 — 머지 후]
6. apps/api/.env 에 MOCK_S3=true append (로컬, gitignored)
7. apps/api/.env.example 에 MOCK_S3=true append + 별도 commit (커밋됨)
8. uvicorn 재시작 → 실기기 S07 ▶ 검증
```

---

## 결정 근거

| 결정 | 대안 | 채택 이유 |
|---|---|---|
| early-return 분기 | if/else 전체 래핑 | 기존 boto3 블록을 건드리지 않아 프로덕션 회귀 위험 최소화 |
| `MOCK_S3: bool = False` 기본값 | True 기본 | 실수로 프로덕션에서 mock URL 노출되는 사고 방지 |
| 경로: `../../static` 상대 경로 | 절대 경로 하드코딩 | 배포 환경 이식성 유지 |
| `StaticFiles` FastAPI 내장 | nginx/별도 파일서버 | 개발 환경 단순화 — nginx는 프로덕션 인프라 단에서 처리 |

---

## 주의사항

- `StaticFiles` 마운트는 `include_router` 보다 먼저 호출해야 한다 (FastAPI route lookup 순서).
- `.env` `MOCK_S3=true` 는 **개발 환경 전용** — CI/프로덕션 환경변수에 포함하면 안 됨.
- `apps/api/static/previews/` 아래 `.wav` 6개 파일이 이미 존재함 (Glob 확인 완료).
- engineer 는 `.env` 와 `.env.example` 어느 쪽도 건드리지 않는다. 시크릿 키 인접 파일에 agent 가 접근하지 못하도록 boundary 훅이 차단 — 메인 운영자가 머지 후 수동 처리.
