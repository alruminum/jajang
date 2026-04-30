---
depth: std
---

# impl/01 — 카테고리 A: 스토어 mock `__esModule: true` 패턴 적용

**Story:** #158 (카테고리 A: ~78 fails — `useAuthStore is not a function`)
**선행 조건:** Epic 08 완료 (jest-expo preset 기준)
**후행 조건:** impl/02 (카테고리 B) 시작 가능

**context budget:** file edits ≤ 20 / tool uses ≤ 60 — sub-batch 분할 권고 (아래 §서브배치 참조)

---

## 근본 원인

Babel이 `jest.mock('@store/authSlice', () => ({ useAuthStore: jest.fn() }))` 를
`(0, _authSlice.useAuthStore)(...)` getter 호출로 변환할 때
`__esModule: true` 플래그가 없으면 default-export interop fallback으로 `undefined` 반환.
결과: `useAuthStore is not a function` TypeError.

**영향 경로 3개:**
| 경로 | 대표 컴포넌트 |
|---|---|
| `@store/authSlice` | S07, S08 (re-export hub) |
| `@store/auth-store` | TrialBadge, TrialExpiryBanner, S06, S01 (원본 파일 직접 참조) |
| `@store` | S16SettingsScreen, SettingsScreen, AccountDeletionScreen (index re-export) |

---

## 수정 파일 목록

### 1-A. `@store/authSlice` + `@store/recordingSlice` 경로 (engineer sub-batch 1-A)

S07, S08 두 파일은 `@store/authSlice`와 `@store/recordingSlice` **두 경로 모두** mock에 `__esModule: true` 필요.
이유: `useRecordingStore()`도 함수로 호출되므로 babel ESM interop 동일 문제 발생.

| 파일 | 변경 내용 |
|---|---|
| `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` | `jest.mock('@store/authSlice', ...)` 및 `jest.mock('@store/recordingSlice', ...)` factory에 각각 `__esModule: true` 첫 키 추가 |
| `apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx` | 동일 (두 경로 모두) |

### 1-B. `@store/auth-store` 경로 (engineer sub-batch 1-B)

| 파일 | 변경 내용 |
|---|---|
| `apps/mobile/src/__tests__/components/TrialBadge.test.tsx` | `jest.mock('@store/auth-store', ...)` factory에 `__esModule: true` 추가 |
| `apps/mobile/src/__tests__/components/TrialExpiryBanner.test.tsx` | 동일 |
| `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` | 동일 |
| `apps/mobile/src/__tests__/screens/S06HomeScreen.test.tsx` | 동일 |
| `apps/mobile/src/__tests__/services/revenue-cat.test.ts` | 동일 |
| `apps/mobile/src/__tests__/useAuth.test.ts` | 동일 |
| `apps/mobile/src/__tests__/useEntitlement.test.ts` | 동일 |
| `apps/mobile/src/__tests__/auth-session.test.ts` | 동일 |

### 1-C. `@store` (index) 경로 (engineer sub-batch 1-C)

| 파일 | 변경 내용 |
|---|---|
| `apps/mobile/src/__tests__/SettingsScreen.test.tsx` | `jest.mock('@store', ...)` factory에 `__esModule: true` 추가 |
| `apps/mobile/src/__tests__/AccountDeletionScreen.test.tsx` | 동일 |
| `apps/mobile/src/__tests__/screens/S16SettingsScreen.test.tsx` | 동일 |

### 추가 스토어 사전 검증 결과 (grep 완료)

아래는 architect가 사전 검증한 결과. engineer는 추가 grep 불필요.

```
grep -rl "jest.mock.*useTrackStore|jest.mock.*@store/track"       → 0 파일
grep -rl "jest.mock.*useSubscriptionStore|@store/subscription"    → 0 파일
grep -rl "@store/recording"  → S07, S08 (1-A 포함 처리)
grep -rl "@store/player-store"  → AudioEngine-timer.test.ts
```

**`@store/player-store` (AudioEngine-timer.test.ts) — `__esModule: true` 불필요:**
- factory가 `{ usePlayerStore: { getState: ..., setState: ... } }` 객체 패턴
- AudioEngine 소스에서 `usePlayerStore()`를 함수로 호출하지 않음 — `.getState()` / `.setState()` 만 사용
- babel ESM interop 문제 대상 아님 → 현행 유지

**`useTrackStore` / `useSubscriptionStore` — 코드베이스에 test mock 없음:**
- 해당 스토어를 `jest.mock()`으로 선언하는 테스트 파일 없음
- 1-C에서 별도 처리 불필요

---

## 서브배치 분할 권고

파일 수가 15+ 개로 engineer 1회 호출 context overflow 위험.
다음 3 sub-batch로 분리하여 각각 독립 engineer 호출 권장:

```
sub-batch 1-A: @store/authSlice + @store/recordingSlice 경로 (2 파일 — S07, S08)
sub-batch 1-B: @store/auth-store 경로 (8 파일)
sub-batch 1-C: @store index 경로 (3 파일 — SettingsScreen, AccountDeletionScreen, S16)
```
※ @store/player-store (AudioEngine-timer.test.ts) 는 __esModule: true 불필요 — 제외

각 sub-batch 완료 후 `npm test <파일들>` GREEN 확인 후 다음 sub-batch 진행.

---

## 적용 패턴 (세 경로 모두 동일)

```ts
// before (동작 안 함)
jest.mock('@store/authSlice', () => ({
  useAuthStore: jest.fn(),
}))

// after — __esModule: true 반드시 첫 번째 키
jest.mock('@store/authSlice', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => mockAuthState),
}))
```

```ts
// @store/auth-store
jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => mockAuthState),
}))
```

```ts
// @store (index)
jest.mock('@store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => mockAuthState),
  // 기존 factory의 다른 export 유지
}))
```

**주의:** factory 안에서 외부 변수(`mockAuthState`)를 참조하는 파일은 jest mock hoisting 규칙 위반.
이미 `mockReturnValue` / `mockImplementation` 패턴을 쓰는 파일은 `jest.fn()` 반환만 유지하고
`beforeEach`에서 `.mockReturnValue(mockAuthState)` 호출 방식으로 유지.

---

## 의사코드 (수정 절차)

```
1. npm test 2>&1 | grep "is not a function" | grep -oP "@store/[^\s']+" | sort | uniq -c
   → 영향 경로·파일 수 확인

2. sub-batch 1-A 수정
   - S07, S08 의 @store/authSlice mock factory 첫 키에 __esModule: true 추가
   - S07, S08 의 @store/recordingSlice mock factory 첫 키에 __esModule: true 추가 (동일 두 파일)
   - npm test apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx GREEN
   - npm test apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx GREEN

3. sub-batch 1-B 수정
   - @store/auth-store 참조 파일 8개 순차 수정
   - npm test <각 파일> GREEN

4. sub-batch 1-C 수정
   - @store index + 나머지 경로 수정
   - npm test <각 파일> GREEN

5. npm test 2>&1 | grep "is not a function" 결과 0건 확인
```

---

## 결정 근거

**대안 1 (채택 X): `__mocks__/` 공통 파일 생성**
- `apps/mobile/src/__mocks__/@store/auth-store.ts` 로 전역화 가능
- 단점: 일부 테스트가 mock state를 per-test `mockReturnValue`로 제어하므로 전역 mock 충돌 위험
- verdict: 이 epic은 fail 수정이 목적이며, 공통화 리팩은 별도 에픽으로 분리

**대안 2 (채택): 각 파일별 factory에 `__esModule: true` 직접 추가**
- 최소 변경, 기존 테스트 의도 보존
- 파일 수는 많지만 패턴이 동일해 기계적 적용 가능

---

## 수용 기준

- (TEST) `npm test 2>&1 | grep "is not a function"` 결과 0건
- (TEST) 카테고리 A 영향 파일 각각 `npm test <파일>` GREEN
- (MANUAL) `npm test` 실행 후 총 fails 수 이전 대비 ~78 감소
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442
