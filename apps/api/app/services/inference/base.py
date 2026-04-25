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
    s3_sample_key: str
    song_key: str
    job_id: uuid.UUID


@dataclass
class InferenceResult:
    """
    VoiceInferenceClient.generate() 반환값.
    mp3_bytes: 생성된 mp3 바이너리. None이면 실패.
    duration_ms: GPU 추론 소요 시간 (관측가능성용).
    error_message: 실패 시 사유.
    """
    mp3_bytes: Optional[bytes]
    duration_ms: int
    error_message: Optional[str] = None

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
