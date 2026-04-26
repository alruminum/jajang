---
depth: std
---
# impl: #86 Android 흰 화면 — @services/api barrel 추가 + client.ts 경로 수정

## 문제 요약

Metro 번들러는 `src/services/api`를 resolve할 때 동명 파일(`api.ts`)과 디렉토리(`api/`)가 공존하면
**디렉토리를 우선** 선택한다. 디렉토리 진입 후 `index.ts` (barrel)가 없으면 500을 반환한다.

추가로 `src/services/api/client.ts`의 `from '../api'`도 동일 이유로 디렉토리를 가리키게 되어
자기 디렉토리를 순환 참조하는 깨진 import가 된다.

```
// Metro 해석 경로 (버그)
@services/api  →  src/services/api/  →  src/services/api/index.ts  (없음 → 500)

// client.ts (버그)
from '../api'  →  src/services/api/  →  index.ts 없음 → 500
```

---

## 수정 범위

### 파일 1 — 신규 생성

**`apps/mobile/src/services/api/index.ts`** (barrel)

역할: `@services/api` alias가 디렉토리로 해석될 때 진입점 제공.
`api` (axios 인스턴스)를 `../api.ts`에서 re-export하고, 서브모듈 함수/타입도 한 곳에서 re-export.

```ts
// apps/mobile/src/services/api/index.ts
// Metro barrel — @services/api 동명 충돌 해소 (#86)
// 원본 axios 인스턴스는 ../api.ts (파일)에 존재한다.
// Metro가 디렉토리를 우선 해석하므로 이 index가 진입점이 된다.

export { api } from '../api.ts';

export * from './challenges';
export * from './songs';
export * from './generations';
export * from './recordings';
export * from './tracks';
```

**대안 검토:**
- `api.ts` → `api-client.ts`로 이름 변경: 충돌 자체를 없애지만 기존 `@services/api` import 전체 교체 필요 (약 20개 파일) — 변경 범위 과다, 회귀 위험
- `api/` 디렉토리명 변경: 동일 이유로 과다 수정
- barrel 추가: 최소 변경, 기존 import 무변경 → 채택

**주의:**
- `from '../api.ts'` — 확장자 `.ts`를 명시한다. Metro/TypeScript 모두 명시적 확장자 경로는 파일 직접 참조로 강제 처리한다. 디렉토리 탐색 분기를 차단하기 위해 필수.
- `export * from './tracks'`는 `tracksApi`와 타입을 노출한다. `tracksApi` 내부는 `./client`를 직접 import하므로 barrel을 통한 순환 참조 없음.

---

### 파일 2 — 수정

**`apps/mobile/src/services/api/client.ts`**

line 5: `from '../api'` → `from '../api.ts'`

```ts
// 변경 전
export { api as apiClient } from '../api'

// 변경 후
export { api as apiClient } from '../api.ts'
```

**근거:** `../api`는 Metro가 디렉토리(`../api/`)로 우선 해석 → index 없으면 500. `.ts` 명시로 파일 직접 참조를 강제.

---

### 파일 3~6 — 수정 (순환 참조 차단) ← SPEC_GAP 보강

**`apps/mobile/src/services/api/songs.ts`**
**`apps/mobile/src/services/api/challenges.ts`**
**`apps/mobile/src/services/api/generations.ts`**
**`apps/mobile/src/services/api/recordings.ts`**

**문제:** 4개 파일 모두 `import { api } from '@services/api'`를 사용한다.
barrel(`index.ts`) 추가 후 `@services/api` → `index.ts` → `export * from './songs'` (등) → `import { api } from '@services/api'` → 다시 `index.ts` — **순환 참조** 완성.

**수정 내용 (4개 파일 동일):**

```ts
// 변경 전
import { api } from '@services/api';

// 변경 후
import { api } from '../api.ts';   // 상대경로 + 확장자 명시 (circular 차단)
```

**근거:**
- `'../api.ts'` — 확장자 명시로 Metro가 파일(`api.ts`)을 직접 resolve. barrel(`index.ts`) 경유 없음 → 순환 끊김.
- alias(`@services/api`) 대신 상대경로 사용이 필수. alias는 Metro가 디렉토리로 해석하므로 barrel을 다시 통과해 순환이 재성립됨.
- `tracks.ts`는 `api`를 `./client`를 통해 간접 사용하므로 해당 없음.

**파일별 수정 라인 위치:**

| 파일 | 수정 라인 | 현재 값 |
|---|---|---|
| `songs.ts` | 최상단 import | `import { api } from '@services/api'` |
| `challenges.ts` | 최상단 import | `import { api } from '@services/api'` |
| `generations.ts` | 최상단 import | `import { api } from '@services/api'` |
| `recordings.ts` | 최상단 import | `import { api } from '@services/api'` |

---

## 인터페이스 (index.ts export 목록)

| export 심볼 | 출처 |
|---|---|
| `api` (AxiosInstance) | `../api.ts` |
| `challengesApi`, `ChallengeResponse` | `./challenges` |
| `songsApi`, `Song`, `SongListResponse`, `PreviewUrlResponse` | `./songs` |
| `generationsApi`, `GenerationStatus`, `GenerationInitRequest`, `GenerationInitResponse`, `GenerationStatusResponse`, `CounterStatusResponse` | `./generations` |
| `recordingsApi`, `UploadInitResponse`, `UploadCompleteResponse`, `ValidateResponse` | `./recordings` |
| `tracksApi`, `TrackItem`, `TracksListResponse`, `TrackDeleteResponse` | `./tracks` |

---

## 기존 테스트 영향 분석

```bash
grep -rl "@services/api" apps/mobile/src/__tests__
```

영향 파일:
- `src/__tests__/services/api.test.ts` — `import '@services/api'` (side-effect only). barrel이 `../api.ts`를 re-export하므로 인터셉터 등록 side-effect 그대로 발생. 테스트 변경 불필요.
- `src/__tests__/services/api/tracks.test.ts` — `vi.mock('@services/api/client', ...)`. `client.ts` 파일 자체는 그대로이므로 테스트 변경 불필요.

**DOM/텍스트 assertion 해당 없음** — 순수 서비스 레이어 변경.

---

## 구현 순서

1. `src/services/api/index.ts` 생성 (barrel)
2. `src/services/api/client.ts` line 5 수정 (`from '../api'` → `from '../api.ts'`)
3. `src/services/api/songs.ts` import 수정 (`@services/api` → `../api.ts`)
4. `src/services/api/challenges.ts` import 수정 (`@services/api` → `../api.ts`)
5. `src/services/api/generations.ts` import 수정 (`@services/api` → `../api.ts`)
6. `src/services/api/recordings.ts` import 수정 (`@services/api` → `../api.ts`)

> 순서 이유: 1번(barrel)이 없으면 3~6번 수정 전에는 순환이 발생하지 않으므로, barrel 생성을 먼저 완료한 뒤 순환 차단 수정을 진행한다.

---

## 검증 방법

```bash
# Metro 개발 서버 실행 (apps/mobile에서)
npx expo start --port 8081

# 별도 터미널에서 Android bundle 200 확인
curl -s 'http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&app=com.jajang.app' \
  -o /dev/null -w "%{http_code}"
# 기대값: 200

# 유닛 테스트
cd apps/mobile && npx vitest run
```

---

## 주의사항

- axios 인스턴스(`api`)를 `src/services/api/` 안으로 이동하는 리팩토링 금지. barrel 추가만.
- `export * from './tracks'` 포함 시 `tracksApi`가 `@services/api`를 통해서도 접근 가능해진다. 기존 `import { tracksApi } from '@services/api/tracks'` 방식과 충돌 없음 (중복 export 경로 허용).
- TypeScript strict 환경에서 `from '../api.ts'` 확장자 명시는 `"moduleResolution": "bundler"` 또는 `"node16"` 이상에서만 허용된다. 현재 `tsconfig.json`이 `expo/tsconfig.base`를 extend하며 expo는 `bundler` 해석을 사용하므로 허용됨. `node` (classic) 해석 환경이면 확장자 없이 `'../api'`를 유지하고 대신 `src/services/api.ts`를 `src/services/api-client.ts`로 이름 변경하는 대안으로 에스컬레이션 필요.
