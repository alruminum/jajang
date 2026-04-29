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

apps/mobile/src/__tests__/screens/
├── S09RecordGuideScreen.test.tsx           [수정 — vi.mock('@services/api/challenges') 제거]
└── S09RecordGuideScreen.refactor.test.tsx  [수정 — vi.mock('@services/api/challenges') 제거]

apps/api/app/api/v1/
└── challenges.py          [수정 — 엔드포인트 410 Gone, require_auth import 제거]

apps/api/tests/
└── test_challenges_deprecated.py  [신규 — 410 회귀 검증]
```

> **참고**: `apps/api/app/main.py` 의 `include_router(challenges.router, ...)` 는 **그대로 유지**한다 (4절 결정 — 410 Gone 응답 채널을 살려두기 위함). main.py 자체는 수정 없음.

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

### 테스트 파일 mock 정리 (GAP-1)

`challenges.ts` 삭제 후 vitest 의 alias 해석이 깨지므로, 잔여 `vi.mock('@services/api/challenges', ...)` 라인을 제거한다.

**S09RecordGuideScreen.refactor.test.tsx** (line 19-22 + 사용 부)
- `mockGetRandomPhrase` 변수 선언 + `vi.mock('@services/api/challenges', ...)` 블록 삭제
- `mockGetRandomPhrase.mockReset()` (beforeEach), `expect(mockGetRandomPhrase).not.toHaveBeenCalled()` 단언이 포함된 케이스(line 58, 77) 도 삭제 — 이미 production 코드에 challengesApi import 가 없으므로 호출 자체가 불가능. mock 없이 단언만 남기면 ReferenceError 가 난다.

**S09RecordGuideScreen.test.tsx** (line 22-29 + 사용 부)
- `mockGetRandomPhrase` 변수 + `vi.mock('@services/api/challenges', ...)` 블록 삭제
- `beforeEach` 블록들의 `mockGetRandomPhrase.mockResolvedValue(...)` 라인 모두 제거 (line 50, 75, 105, 130, 156)
- 이 테스트는 권한 분기/모달 동작 중심이므로 challengesApi mock 없이도 시나리오는 통과해야 한다.

> 위 두 파일의 production import 제거는 impl/09 에서 이미 완료됐다. 이번 task 는 **테스트 파일에 살아남은 mock 부산물만** 청소.

---

## 4. 서버 변경

### challenges.py 교체

기존 파일은 다음 import 들을 갖고 있다:
```python
import random
from fastapi import APIRouter, Depends
from app.api.deps import require_auth
```

**전면 교체**한다. `random`, `Depends`, `require_auth`, `CHALLENGE_PHRASES` 모두 미사용이 되므로 함께 삭제 (GAP-3).

```python
# apps/api/app/api/v1/challenges.py (전체 교체)

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

핵심:
- `require_auth` 의존성 제거 — 인증 없이도 410 반환 (구버전 클라이언트는 토큰 만료 후일 수 있음).
- `random.choice` / `CHALLENGE_PHRASES` 모두 제거.

### main.py — 변경 없음

`challenges.router` 의 `include_router(...)` 등록은 그대로 유지한다. 410 응답을 반환하는 채널이기 때문 (라우터를 끊으면 404 가 되어 의도와 어긋난다). 다음 마일스톤에서 라우터 자체를 삭제할 때 main.py 도 함께 정리한다.

### 서버 회귀 테스트 (GAP-4)

`apps/api/tests/test_challenges_deprecated.py` 신규 작성:

```python
"""
#133 — challenges API deprecation 회귀 테스트.
PRD v1.2: challenge-response 폐기. 구버전 클라이언트 호환용 410 응답 보장.
"""

from fastapi.testclient import TestClient

from app.main import app


def test_get_random_challenge_returns_410():
    """GET /api/v1/challenges/random 은 인증 없이 410 Gone 을 반환한다."""
    client = TestClient(app)
    res = client.get("/api/v1/challenges/random")
    assert res.status_code == 410
```

> conftest.py 가 환경변수를 선행 주입하므로 별도 픽스처 불필요. 인증 미필요는 의도된 계약 (410 응답에는 인증 가드 없음) — 테스트가 이 계약을 명시적으로 검증한다.

---

## 5. 수용 기준

- [ ] `apps/mobile/src/services/api/challenges.ts` 파일 없음
- [ ] `services/api/index.ts`에 challenges re-export 없음
- [ ] `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` 와 `S09RecordGuideScreen.refactor.test.tsx` 에 `vi.mock('@services/api/challenges', ...)` 라인 없음 (grep `challenges` 결과 0)
- [ ] `cd apps/mobile && npx vitest run` 통과 (alias 해석 실패 없음)
- [ ] `GET /api/v1/challenges/random` → HTTP 410 반환
- [ ] `apps/api/tests/test_challenges_deprecated.py` 가 `pytest` 에서 통과
- [ ] `apps/api/app/api/v1/challenges.py` 에 `require_auth`, `random`, `Depends` import 없음 (grep 결과 0)
- [ ] 기존 RecordGuideScreen에서 challenges import 없음 (impl/09 완료 전제)

---

## 6. 주의사항

- impl/09 완료 후 grep으로 challenges 참조가 완전히 제거되었는지 확인 필수. 잔여 import가 있으면 빌드 오류 발생.
- 서버 410 유지는 1~2개 마일스톤 한시적 유지. 이후 라우터 전체 제거 시 backlog에 클린업 태스크 등록.
