"""
테스트 픽스처 — 환경변수 Mock 설정.

app 모듈 임포트 전에 필수 환경변수를 세팅해 Settings() 초기화 실패를 방지한다.
conftest.py 는 pytest 가 테스트 모듈보다 먼저 로드하므로 os.environ 선행 주입이 가능하다.
"""

import os

# ── 필수 환경변수 Mock (Settings 초기화에 필요) ─────────────────────────────
_DUMMY_RSA_PRIVATE = (
    "-----BEGIN RSA PRIVATE KEY-----\n"
    "MIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtE1EBfzRBPVfS6FLDpQXTFhM\n"
    "b3NqaC3mjmkMM8BQOIW/CiZMuBJdLrUGMFwVhCHBBEFKRfj6Tq3Gvk3PnPNR\n"
    "-----END RSA PRIVATE KEY-----\n"
)
_DUMMY_RSA_PUBLIC = (
    "-----BEGIN PUBLIC KEY-----\n"
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xHn/ygWe\n"
    "p4PAtE1EBfzRBPVfS6FLDpQXTFhMb3NqaC3mjmkMM8BQOIW/CiZMuBJdLrUGMF\n"
    "-----END PUBLIC KEY-----\n"
)

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_PRIVATE_KEY", _DUMMY_RSA_PRIVATE)
os.environ.setdefault("JWT_PUBLIC_KEY", _DUMMY_RSA_PUBLIC)
os.environ.setdefault("S3_ACCESS_KEY", "AKIATEST")
os.environ.setdefault("S3_SECRET_KEY", "secrettest")
os.environ.setdefault("S3_BUCKET_NAME", "jajang-audio-test")
os.environ.setdefault("ENV", "test")
