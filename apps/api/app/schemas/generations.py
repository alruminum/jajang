import uuid
from typing import Literal, Optional

from pydantic import BaseModel


class GenerationInitRequest(BaseModel):
    """
    POST /generations/init — 생성 잡 등록 요청.
    job_id: 클라이언트가 생성한 UUID (멱등성 키). 재시도 시 동일 값 전달.
    """

    job_id: uuid.UUID
    voice_sample_id: uuid.UUID  # Epic 02에서 검증 통과한 sample_id
    song_key: Literal["brahms", "mozart", "schubert", "twinkle", "rockabye", "hush"]


class GenerationInitResponse(BaseModel):
    job_id: str
    track_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    is_new: bool  # True = 신규 등록, False = 기존 job_id 멱등 반환
    # is_new=False 시 클라이언트는 폴링으로 현재 상태 확인


class GenerationStatusResponse(BaseModel):
    job_id: str
    track_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    presigned_url: Optional[str] = None  # status='completed' 시만 존재 (1h 만료)
    error_message: Optional[str] = None  # status='failed' 시만 존재
    queue_position: Optional[int] = None  # 큐 대기 중일 때 (향후 구현)


class CounterStatusResponse(BaseModel):
    """GET /generations/counter — 클라이언트 횟수 UI 동기화용"""

    count: int
    limit: int  # 무료 = 3, 프리미엄 = None 대신 매우 큰 값 사용
    remaining: int
    is_free_tier: bool
