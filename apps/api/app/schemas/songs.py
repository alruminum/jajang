from pydantic import BaseModel


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
    preview_url: str  # presigned URL (만료 S3_PREVIEW_EXPIRY_SECONDS)
    expires_in_seconds: int
