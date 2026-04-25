from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # DB
    DATABASE_URL: str
    REDIS_URL: str

    # JWT
    JWT_PRIVATE_KEY: str  # RS256 PEM
    JWT_PUBLIC_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Storage
    S3_BUCKET_NAME: str = "jajang-audio"
    S3_REGION: str = "ap-northeast-2"
    S3_ACCESS_KEY: str
    S3_SECRET_KEY: str
    S3_ENDPOINT_URL: str | None = None  # R2 선택 시

    # GPU (M0 이후 확정)
    MOCK_GPU: bool = True
    REPLICATE_API_TOKEN: str | None = None

    # Social Auth
    GOOGLE_CLIENT_ID: str = ""

    # Env
    ENV: str = "development"


settings = Settings()
