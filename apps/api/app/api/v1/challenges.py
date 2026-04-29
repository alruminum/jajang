from fastapi import APIRouter, HTTPException, status

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("/random")
async def get_random_challenge():
    """
    [DEPRECATED] challenge-response 문구 API.
    PRD v1.2 (2026-04-28): challenge-response 폐기 — 가사 박스로 대체.
    이전 클라이언트 호환을 위해 410 Gone 반환.
    다음 마일스톤에서 라우터 전체 제거 예정.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="이 기능은 더 이상 사용되지 않아요",
    )
