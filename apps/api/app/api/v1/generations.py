"""
[DEPRECATED] v1.3.1: AI 합성 폐기 → DSP 전환.
구 클라이언트 호환을 위해 410 Gone 반환.
다음 마일스톤에서 라우터 전체 제거 예정.
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/generations", tags=["generations"])


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def generations_deprecated(path: str):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이 API는 더 이상 사용되지 않아요. /sessions 엔드포인트를 사용해주세요.",
    )
