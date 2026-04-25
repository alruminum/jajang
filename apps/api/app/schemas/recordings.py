from typing import Literal, Optional

from pydantic import BaseModel, Field


class UploadInitRequest(BaseModel):
    """
    녹음 파일 업로드 전 presigned PUT URL 요청.
    file_size_bytes: 클라이언트가 사전 계산한 파일 크기 (서버 사전 검증용).
    """

    song_key: str
    file_size_bytes: int = Field(gt=0, lt=50 * 1024 * 1024)  # 최대 50MB (안전 상한)
    content_type: Literal["audio/wav", "audio/m4a", "audio/mp4"] = "audio/wav"


class UploadInitResponse(BaseModel):
    sample_id: str  # voice_samples.id (UUID)
    upload_url: str  # S3 presigned PUT URL
    s3_key: str
    expires_in_seconds: int


class UploadCompleteRequest(BaseModel):
    """클라이언트 업로드 완료 통보 + 클라이언트 1차 검증 결과 전달."""

    sample_id: str
    duration_seconds: float = Field(gt=0)
    rms_db: float
    peak_count: int = Field(ge=0)


class UploadCompleteResponse(BaseModel):
    sample_id: str
    status: Literal["uploaded"] = "uploaded"
    message: str = "업로드가 완료됐어요. 품질을 확인할게요."


class ValidateResponse(BaseModel):
    sample_id: str
    passed: bool
    snr_db: Optional[float] = None
    fail_reason: Optional[str] = None
    message: str
