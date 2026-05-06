---
depth: std
design: skipped
---

# impl/03 — 서버: VoiceInferenceClient 추상 인터페이스 + Mock 구현체

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 2 (서버 GPU 추론 잡 — 추상화 계층)  
**선행 조건**: impl/01 완료 (GeneratedTrack ORM)  
**예상 소요**: 2~3시간

> **M0 연계**: 이 impl은 실제 GPU 추론 호출을 하지 않는다.
> `MOCK_GPU=true` (기본) 환경에서는 3초 대기 후 placeholder mp3를 반환한다.
> M0 벤치마크 후 Replicate/Modal 구체 구현체로 교체. 추상 인터페이스는 변경 없음.

---

## 1. 생성/수정할 파일 목록

```
apps/api/app/
├── services/
│   ├── inference/
│   │   ├── __init__.py                   [신규]
│   │   ├── base.py                       [신규 — VoiceInferenceClient ABC]
│   │   ├── mock_client.py                [신규 — MockInferenceClient (M0 전 사용)]
│   │   └── factory.py                    [신규 — 환경변수 분기로 client 인스턴스 반환]
│   └── storage_service.py                [수정 — mp3 S3 업로드 메서드 추가]
└── core/
    └── config.py                         [수정 — MOCK_GPU, INFERENCE_PROVIDER 추가]
```

---

## 2. 추상 인터페이스

```python
# apps/api/app/services/inference/base.py

import abc
import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass
class InferenceInput:
    """
    VoiceInferenceClient.generate() 호출 입력.
    s3_sample_key: voice_samples.s3_key (서버가 직접 S3에서 읽어 모델에 전달)
    song_key: 생성할 자장가 종류
    job_id: 추적용 (로깅, 멱등성)
    """
    s3_sample_key:  str
    song_key:       str
    job_id:         uuid.UUID


@dataclass
class InferenceResult:
    """
    VoiceInferenceClient.generate() 반환값.
    mp3_bytes: 생성된 mp3 바이너리. None이면 실패.
    duration_ms: GPU 추론 소요 시간 (관측가능성용).
    error_message: 실패 시 사유.
    """
    mp3_bytes:      Optional[bytes]
    duration_ms:    int
    error_message:  Optional[str] = None

    @property
    def success(self) -> bool:
        return self.mp3_bytes is not None and self.error_message is None


class VoiceInferenceClient(abc.ABC):
    """
    보이스 변환 추론 추상 클라이언트.

    구현 계약:
    - generate()는 블로킹 호출이다 (Celery worker 내부에서 호출).
    - 90초 초과 시 반드시 InferenceResult(mp3_bytes=None, error_message='timeout')을 반환.
      예외를 raise하면 Celery retry 로직과 충돌하므로 반환값으로 실패를 표현.
    - mp3_bytes는 표준 MP3 바이너리여야 한다 (react-native-track-player 직접 재생 가능).
    - 구현체 교체 시 이 인터페이스를 변경하지 않는다 — factory.py에서 구현체만 교체.
    """

    TIMEOUT_SECONDS = 90  # NFR: 90초 이내 반환 (trd.md §9)

    @abc.abstractmethod
    def generate(self, input: InferenceInput) -> InferenceResult:
        """
        보이스 샘플 + 곡을 이용해 개인화 자장가 mp3 생성.
        """
        ...

    @abc.abstractmethod
    def health_check(self) -> bool:
        """
        추론 서비스 가용성 확인. True = 정상.
        파이프라인 실행 전 선택적 호출 가능.
        """
        ...
```

---

## 3. Mock 구현체 (M0 전 사용)

```python
# apps/api/app/services/inference/mock_client.py

import time
import uuid
import os
import structlog
from app.services.inference.base import VoiceInferenceClient, InferenceInput, InferenceResult

logger = structlog.get_logger()

# placeholder mp3: 3초짜리 무음 mp3 (바이너리 하드코딩).
# 실제 파일 경로 방식 대신 최소 유효 mp3 바이너리를 직접 embed.
# 이유: 파일 경로 의존성 없이 컨테이너 이미지 이식성 유지.
#
# 3초 무음 44.1kHz 16bit mono MP3 (ID3v2 + MPEG frame)
# engineer: 실제 구현 시 ffmpeg로 생성한 silent_3s.mp3를 base64로 인코딩해 교체.
# $ ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 3 -q:a 9 -acodec libmp3lame silent.mp3
# $ python3 -c "import base64; print(base64.b64encode(open('silent.mp3','rb').read()).decode())"
_PLACEHOLDER_MP3_B64 = (
    "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA"
    # TODO: replace with actual base64-encoded silent_3s.mp3 after ffmpeg generation
    # This is a truncated placeholder — will cause audio errors if used as-is
)

try:
    import base64
    _PLACEHOLDER_MP3 = base64.b64decode(_PLACEHOLDER_MP3_B64 + "==")
except Exception:
    # fallback: 4바이트 유효하지 않은 mp3 (개발 중 에러 노출용)
    _PLACEHOLDER_MP3 = b"\xff\xfb\x90\x00"


class MockInferenceClient(VoiceInferenceClient):
    """
    M0 벤치마크 전 사용하는 mock 구현체.

    동작:
    - MOCK_LATENCY_MS 환경변수만큼 sleep 후 placeholder mp3 반환 (기본 3000ms).
    - MOCK_FAIL_RATE 환경변수(0~1) 확률로 실패 반환 (실패 경로 테스트용, 기본 0.0).
    - 실제 S3 접근, GPU 호출 없음.

    교체 시점:
    - M0 벤치마크에서 추론 플랫폼 및 모델 확정 후 ReplicateClient 또는 ModalClient로 교체.
    - factory.py에서 INFERENCE_PROVIDER 환경변수로 분기.
    """

    def __init__(self):
        self._latency_ms = int(os.getenv("MOCK_LATENCY_MS", "3000"))
        self._fail_rate  = float(os.getenv("MOCK_FAIL_RATE", "0.0"))

    def generate(self, input: InferenceInput) -> InferenceResult:
        logger.info(
            "inference.mock.generate.start",
            job_id=str(input.job_id),
            song_key=input.song_key,
            latency_ms=self._latency_ms,
        )

        start = time.monotonic()
        time.sleep(self._latency_ms / 1000.0)
        elapsed_ms = int((time.monotonic() - start) * 1000)

        # 실패 시뮬레이션 (테스트용)
        import random
        if random.random() < self._fail_rate:
            logger.warning("inference.mock.generate.simulated_failure", job_id=str(input.job_id))
            return InferenceResult(
                mp3_bytes=None,
                duration_ms=elapsed_ms,
                error_message="simulated_failure (MOCK_FAIL_RATE)",
            )

        logger.info(
            "inference.mock.generate.success",
            job_id=str(input.job_id),
            duration_ms=elapsed_ms,
        )
        return InferenceResult(
            mp3_bytes=_PLACEHOLDER_MP3,
            duration_ms=elapsed_ms,
        )

    def health_check(self) -> bool:
        return True
```

---

## 4. Factory — 환경변수 분기

```python
# apps/api/app/services/inference/factory.py

import os
import functools
from app.services.inference.base import VoiceInferenceClient


@functools.lru_cache(maxsize=1)
def get_inference_client() -> VoiceInferenceClient:
    """
    MOCK_GPU=true (기본) → MockInferenceClient
    INFERENCE_PROVIDER=replicate → ReplicateClient (M0 이후 구현)
    INFERENCE_PROVIDER=modal    → ModalClient (M0 이후 구현)

    lru_cache로 싱글톤 보장.
    Celery worker 프로세스마다 한 번 초기화.
    """
    mock_gpu = os.getenv("MOCK_GPU", "true").lower() == "true"
    provider = os.getenv("INFERENCE_PROVIDER", "mock").lower()

    if mock_gpu or provider == "mock":
        from app.services.inference.mock_client import MockInferenceClient
        return MockInferenceClient()

    if provider == "replicate":
        # M0 이후 구현
        # from app.services.inference.replicate_client import ReplicateClient
        # return ReplicateClient(api_token=os.environ["REPLICATE_API_TOKEN"])
        raise NotImplementedError(
            "ReplicateClient not implemented yet. "
            "Set MOCK_GPU=true for development. "
            "Implement after M0 benchmark."
        )

    if provider == "modal":
        # M0 이후 구현
        # from app.services.inference.modal_client import ModalClient
        # return ModalClient(token_id=os.environ["MODAL_TOKEN_ID"])
        raise NotImplementedError(
            "ModalClient not implemented yet. "
            "Set MOCK_GPU=true for development."
        )

    raise ValueError(f"Unknown INFERENCE_PROVIDER: {provider!r}")
```

---

## 5. storage_service mp3 업로드 메서드 추가

```python
# apps/api/app/services/storage_service.py (수정 — 기존 파일에 추가)

import uuid
import boto3
from botocore.exceptions import ClientError
import structlog
from app.core.config import settings

logger = structlog.get_logger()

TRACK_S3_PREFIX = "tracks"      # mp3 결과물 저장 위치
TRACK_PRESIGN_EXPIRY = 3600     # presigned URL 만료: 1시간 (trd.md §1 보안)


def upload_mp3(
    user_id: uuid.UUID,
    track_id: uuid.UUID,
    mp3_bytes: bytes,
) -> str:
    """
    생성된 mp3 바이너리를 S3에 업로드.
    반환값: s3_key (e.g. "tracks/{user_id}/{track_id}.mp3")
    """
    s3_key = f"{TRACK_S3_PREFIX}/{user_id}/{track_id}.mp3"

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
    """
    mp3 S3 경로에 대한 presigned GET URL 반환 (1시간 만료).
    클라이언트가 직접 S3에서 다운로드할 때 사용.
    """
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


def _s3_client():
    """boto3 S3 클라이언트. R2 endpoint 분기 포함."""
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        **({"endpoint_url": settings.CLOUDFLARE_R2_ENDPOINT}
           if getattr(settings, "CLOUDFLARE_R2_ENDPOINT", None)
           else {}),
    )
```

---

## 6. config.py 추가 항목

```python
# apps/api/app/core/config.py (기존 Settings 클래스에 추가)

class Settings(BaseSettings):
    # ... 기존 필드 유지 ...

    # GPU 추론 분기
    MOCK_GPU:            bool = True    # 기본 True (개발환경 mock)
    INFERENCE_PROVIDER:  str  = "mock"  # mock | replicate | modal
    MOCK_LATENCY_MS:     int  = 3000    # MockClient 대기 시간 (ms)
    MOCK_FAIL_RATE:      float = 0.0   # MockClient 실패 확률 (0~1)

    # Replicate (M0 이후)
    REPLICATE_API_TOKEN: str = ""

    # Modal (M0 이후)
    MODAL_TOKEN_ID:      str = ""
    MODAL_TOKEN_SECRET:  str = ""
```

---

## 7. M0 이후 교체 가이드

M0 벤치마크 결과 플랫폼 확정 후 아래 단계로 교체:

```
1. apps/api/app/services/inference/replicate_client.py 생성
   - VoiceInferenceClient 상속
   - generate(): replicate.run() 호출 + 90초 timeout
   - mp3 bytes 반환 (replicate output URL → requests.get().content)

2. factory.py: INFERENCE_PROVIDER=replicate 분기 주석 해제

3. 환경변수 추가: REPLICATE_API_TOKEN, INFERENCE_PROVIDER=replicate, MOCK_GPU=false

4. VoiceInferenceClient ABC는 변경 없음
5. Celery task (impl/04) 변경 없음
6. 라우터 (impl/04) 변경 없음
```

---

## 8. 수용 기준

- [ ] `MOCK_GPU=true` 환경에서 `get_inference_client()` → MockInferenceClient 반환
- [ ] MockInferenceClient.generate() → 3초 후 InferenceResult(mp3_bytes=bytes, ...) 반환
- [ ] MockInferenceClient.health_check() → True
- [ ] `MOCK_FAIL_RATE=1.0` 설정 시 → InferenceResult(mp3_bytes=None, error_message='simulated_failure')
- [ ] `INFERENCE_PROVIDER=replicate` + `MOCK_GPU=false` → NotImplementedError (M0 전 의도된 에러)
- [ ] upload_mp3() → S3에 `tracks/{user_id}/{track_id}.mp3` 키로 업로드 (mock S3 또는 localstack)
- [ ] generate_presigned_url() → 유효한 URL 반환, 1시간 만료

---

## 9. 주의사항

- `VoiceInferenceClient.generate()`는 동기 함수다. Celery worker(sync)에서 호출되므로 async 선언 금지. FastAPI 비동기 라우터에서 직접 호출하지 않는다 — 반드시 Celery task를 통해서만 호출.
- placeholder mp3 바이너리 (`_PLACEHOLDER_MP3_B64`)는 현재 truncated 상태. engineer가 `ffmpeg` 명령으로 실제 3초 무음 mp3를 생성해 base64로 교체해야 한다. 잘못된 mp3 바이너리는 react-native-track-player에서 재생 오류를 일으킨다.
- `lru_cache`로 싱글톤 처리된 client는 Celery worker 재시작 없이 환경변수 변경 시 반영되지 않는다. 개발 중 `MOCK_GPU` 변경 시 worker 재시작 필요.
- storage_service.py에 기존 `_s3_client()` 함수가 recording_service.py에도 중복 정의돼 있을 수 있다. 중복 제거: 공통 `_s3_client()` 를 `app/core/storage.py`로 이동 권장 (Epic 03 리팩 범위에 포함).
