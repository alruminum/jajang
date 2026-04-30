from datetime import datetime
from typing import Optional

from pydantic import BaseModel, UUID4


class SessionInitRequest(BaseModel):
    idempotency_key: UUID4       # 클라이언트 생성 UUID (멱등성 키)
    song_key: str                # 'brahms' | 'mozart' | ...


class SessionInitResponse(BaseModel):
    session_id: str
    presigned_upload_url: str    # S3 presigned PUT URL (클립 업로드용)
    s3_key: str                  # 업로드 후 /recordings 에 전달할 키
    is_new: bool                 # False = 기존 세션 반환


class RecordingRegisterRequest(BaseModel):
    s3_key: str       # 업로드된 S3 키
    duration_ms: int  # 클립 길이 (ms)


class RecordingRegisterResponse(BaseModel):
    recording_id: str


class GenerateRequest(BaseModel):
    pass  # reserved — session_id는 path param


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str          # 'open' | 'generating' | 'completed' | 'failed'
    master_status: Optional[str] = None   # master_audio.status
    presigned_url: Optional[str] = None  # completed 시만
    error_message: Optional[str] = None


class MasterAudioItem(BaseModel):
    session_id: str
    song_key: str
    presigned_url: str
    completed_at: datetime
    dsp_duration_ms: Optional[int] = None


class MastersListResponse(BaseModel):
    items: list[MasterAudioItem]
    has_pending: bool    # S06 "생성 완료 음원 있음" 카드 표시 여부
