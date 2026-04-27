from dataclasses import dataclass

import boto3
from botocore.exceptions import ClientError

from app.core.config import settings
from app.schemas.songs import PreviewUrlResponse, SongListResponse, SongResponse


@dataclass(frozen=True)
class SongMeta:
    key: str  # DB song_key 컬럼과 동일 값
    title_ko: str
    title_en: str
    composer: str
    duration_seconds: int  # 전체 길이 (정보 표시용)
    preview_s3_key: str  # S3 내 미리듣기 mp3 경로 (30초 클립)


SONGS: list[SongMeta] = [
    SongMeta("brahms",   "브람스 자장가",      "Brahms' Lullaby",    "요하네스 브람스", 180, "previews/brahms_preview.wav"),
    SongMeta("mozart",   "모차르트 자장가",     "Mozart's Lullaby",   "볼프강 모차르트", 150, "previews/mozart_preview.wav"),
    SongMeta("schubert", "슈베르트 자장가",     "Schubert's Lullaby", "프란츠 슈베르트", 200, "previews/schubert_preview.wav"),
    SongMeta("twinkle",  "반짝반짝 작은 별",    "Twinkle Twinkle",    "전통 민요",       120, "previews/twinkle_preview.wav"),
    SongMeta("rockabye", "자장자장 (영)",       "Rock-a-bye Baby",    "전통 민요",       130, "previews/rockabye_preview.wav"),
    SongMeta("hush",     "허쉬 리틀 베이비",    "Hush Little Baby",   "전통 민요",       140, "previews/hush_preview.wav"),
]

SONGS_BY_KEY: dict[str, SongMeta] = {s.key: s for s in SONGS}


def get_all_songs() -> SongListResponse:
    """정적 상수에서 목록 반환 — DB 조회 없음."""
    return SongListResponse(
        songs=[
            SongResponse(
                key=s.key,
                title_ko=s.title_ko,
                title_en=s.title_en,
                composer=s.composer,
                duration_seconds=s.duration_seconds,
            )
            for s in SONGS
        ]
    )


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
