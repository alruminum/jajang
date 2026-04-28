"""
#127 — MOCK_S3=true 환경 전용 mock S3 PUT 수신 라우트.

recording_service.init_upload 가 MOCK_S3=true 시 발급한 mock URL의 PUT 요청 수신.
바이트 수신 후 즉시 200 반환 — 디스크 저장 없음 (validate 도 MOCK_S3 시 SNR 분석 skip).
프로덕션에선 이 라우터가 등록되지 않음 (main.py 조건부 include).
"""

from fastapi import APIRouter, Request, status

router = APIRouter(prefix="/_mock_s3", tags=["mock"])


@router.put("/{key:path}", status_code=status.HTTP_200_OK)
async def mock_s3_put(key: str, request: Request) -> dict:
    """MOCK_S3=true 환경에서 클라이언트 PUT 수신 후 즉시 200 반환."""
    body = await request.body()
    return {"key": key, "bytes_received": len(body)}
