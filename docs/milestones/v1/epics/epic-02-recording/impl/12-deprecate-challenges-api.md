---
depth: simple
---

# impl/12 — challenges API 폐기 — #133

**Epic**: 02 — 목소리 녹음 & 품질 검증
**커버 스토리**: 기술 정리 (challenge-response 전면 폐기)
**선행 조건**: impl/09 완료 (RecordGuideScreen에서 challengesApi import 제거 완료 후)
**이슈**: #133
**예상 소요**: 0.5시간

---

## 1. 제거/수정할 파일 목록

```
apps/mobile/src/services/api/
├── challenges.ts          [삭제]
└── index.ts               [수정 — challenges re-export 제거]

apps/api/app/api/v1/
└── challenges.py          [수정 — 엔드포인트 410 Gone 처리]

apps/api/app/main.py (또는 router 등록 파일)
                           [수정 — challenges router 등록 제거]
```

---

## 2. 설계 결정

### 클라이언트: 파일 삭제

`challenges.ts`는 `RecordGuideScreen`에서만 사용되었으며 impl/09에서 import가 제거됨. 불필요한 파일 완전 삭제.

### 서버: 410 Gone vs 라우터 제거

**결정: 서버 라우터는 410 Gone으로 교체하고 즉시 제거하지 않음.**

이유:
- 이전 앱 버전(구 클라이언트)이 여전히 `/challenges/random`을 호출할 수 있음
- 404 대신 410은 "영구적으로 제거됨"을 명시적으로 표현 (RFC 7231)
- 1개 마일스톤 후 라우터 완전 제거 (별도 클린업 태스크)

서버 측 변경: 기존 `@router.get("/random")` 로직을 `HTTP 410 Gone` 반환으로 교체.

---

## 3. 클라이언트 변경

### challenges.ts 삭제

```bash
# 삭제 전 확인: 다른 파일에서 import하는지 grep
grep -r "challenges" apps/mobile/src --include="*.ts" --include="*.tsx"
```

위 grep에서 impl/09 적용 완료 후 RecordGuideScreen에 import가 없으면 파일 삭제.

### services/api/index.ts — re-export 제거

현재 `index.ts` 내 challenges re-export 구문 있으면 제거:
```typescript
// 제거
export * from './challenges'
```

---

## 4. 서버 변경

### challenges.py 교체

```python
# apps/api/app/api/v1/challenges.py (교체)

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
```

`require_auth` 의존성도 제거. 410은 인증 없이 반환.

### main.py (또는 router 파일)

challenges router는 main.py include_router에 그대로 유지 (410 응답용). 단, `__init__.py`에서 import 방식에 따라 별도 수정 필요 없을 수 있음.

---

## 5. 수용 기준

- [ ] `apps/mobile/src/services/api/challenges.ts` 파일 없음
- [ ] `services/api/index.ts`에 challenges re-export 없음
- [ ] `GET /api/v1/challenges/random` → HTTP 410 반환
- [ ] 기존 RecordGuideScreen에서 challenges import 없음 (impl/09 완료 전제)

---

## 6. 주의사항

- impl/09 완료 후 grep으로 challenges 참조가 완전히 제거되었는지 확인 필수. 잔여 import가 있으면 빌드 오류 발생.
- 서버 410 유지는 1~2개 마일스톤 한시적 유지. 이후 라우터 전체 제거 시 backlog에 클린업 태스크 등록.
