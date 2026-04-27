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

    # GPU 추론 분기
    MOCK_GPU: bool = True                   # 기본 True (개발환경 mock)
    INFERENCE_PROVIDER: str = "mock"        # mock | replicate | modal
    MOCK_LATENCY_MS: int = 3000             # MockClient 대기 시간 (ms)
    MOCK_FAIL_RATE: float = 0.0             # MockClient 실패 확률 (0~1)

    # Replicate (M0 이후)
    REPLICATE_API_TOKEN: str = ""

    # Modal (M0 이후)
    MODAL_TOKEN_ID: str = ""
    MODAL_TOKEN_SECRET: str = ""

    # Social Auth
    GOOGLE_CLIENT_ID: str = ""
    MOCK_GOOGLE_AUTH: bool = False   # true 시 Google tokeninfo 호출 스킵 (개발 환경 전용)

    # RevenueCat
    REVENUECAT_WEBHOOK_SECRET: str = ""

    # Storage — mock (개발환경 S3 우회)
    MOCK_S3: bool = False   # true 시 boto3 skip → 로컬 /static/previews/ URL 반환

    # Storage — presigned URL
    S3_PREVIEW_EXPIRY_SECONDS: int = 3600  # presigned URL 유효 시간 (1시간)

    # DB 자동 생성 (SQLite dev 환경 전용)
    AUTO_CREATE_TABLES: bool = False  # True 시 startup에서 Base.metadata.create_all 실행
                                      # SQLite URL이면 자동 True 취급 (조건: url이 "sqlite"로 시작)

    # Env
    ENV: str = "development"


settings = Settings()
