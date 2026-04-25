import random

from fastapi import APIRouter, Depends

from app.api.deps import require_auth

router = APIRouter(prefix="/challenges", tags=["challenges"])

CHALLENGE_PHRASES = [
    "달빛 아래 우리 아기 잠들어요",
    "자장 자장 우리 아기",
    "별빛 가득한 밤이에요",
    "엄마 아빠 목소리 들어봐요",
    "조용히 눈을 감아요",
]


@router.get("/random")
async def get_random_challenge(user_id: str = Depends(require_auth)):
    """
    랜덤 challenge-response 문구 반환.
    서버는 클라이언트 녹음 내용과 대조하지 않음 (음성 인식 비용 불필요).
    화면 표시 + UX 마찰로 제3자 업로드 방지.
    """
    return {"phrase": random.choice(CHALLENGE_PHRASES)}
