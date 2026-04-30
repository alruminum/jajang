---
depth: std
---

# impl/05 — [Story 4a / #170] google-signin statusCodes mock + A11Y matcher 도입 (인프라 10 fails)

**Story:** #170 (Story 4a — D-1 SocialAuthButtons 7 + D-8 A11Y 3 = 10 fails)
**선행 조건:** 없음 (병렬 가능 batch). 단 impl/06 보다 먼저 — 인프라 변경이 분산 fails 일부 자동 흡수.
**후행 조건:** SocialAuthButtons 0 failures, A11Y matcher 사용 suites 0 failures

**context budget:** file edits ≤ 4 / tool uses ≤ 25

---

## 0. 시작 전 fail 패턴 재확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
# G: SocialAuthButtons 5 CANCELED + 2 toHaveBeenCalled
npx jest src/__tests__/components/SocialAuthButtons.test.tsx 2>&1 | grep "●" | head -10
# H: A11Y matcher
npx jest src/__tests__/components/SongListItem.test.tsx 2>&1 | grep "●"
npx jest src/__tests__/screens/S07SongSelectScreen.test.tsx 2>&1 | grep "●"
```

기대 패턴:
- G (5): `Cannot read properties of undefined (reading 'CANCELED')`
- G (2): `Expected number of calls: >= 1` (mock spy)
- H (3): `toHaveAccessibilityState is not a function` 또는 multiple `selected: false`

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/__mocks__/@react-native-google-signin/google-signin.ts` — manual mock (신설)
  - 또는 `_setup.ts` 에 `jest.mock(...)` 추가 (둘 중 하나 — manual mock 우선)
- `apps/mobile/src/__tests__/_setup.ts` — `import '@testing-library/jest-native/extend-expect'` 추가 (A11Y matcher 등록)
- `apps/mobile/package.json` — `@testing-library/jest-native` devDependency 확인 (없으면 추가 필요 여부 검토)

---

## 인터페이스

### google-signin manual mock

```ts
// apps/mobile/src/__tests__/__mocks__/@react-native-google-signin/google-signin.ts
export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  CANCELED: 'CANCELED',                     // 일부 버전 호환
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
};

export const GoogleSignin = {
  configure: jest.fn(),
  signIn: jest.fn(async () => ({
    type: 'success',
    data: {
      idToken: 'mock-id-token',
      user: { email: 'mock@test.com', id: 'mock-id', name: 'Mock' },
    },
  })),
  signOut: jest.fn(async () => undefined),
  isSignedIn: jest.fn(async () => false),
  getCurrentUser: jest.fn(() => null),
  hasPlayServices: jest.fn(async () => true),
};

export const GoogleSigninButton = () => null;
```

> **검증 필요**: `statusCodes` 의 정확한 키 (`SIGN_IN_CANCELLED` vs `CANCELED`) 는 `@react-native-google-signin/google-signin` 의 실제 버전 (`apps/mobile/package.json` 확인) 에 맞춰 결정. 실측 코드의 `if (error.code === statusCodes.X)` 패턴 grep 으로 어느 키 참조 중인지 확인.

### A11Y matcher 도입

```ts
// _setup.ts (맨 위)
import '@testing-library/jest-native/extend-expect';
```

> **검증 필요**: `@testing-library/jest-native` 가 jest-expo preset 과 호환인지 확인. 미호환 시 fallback — testing-library v12 의 prop 직접 검증 (`element.props.accessibilityState.selected`).

---

## 의사코드

```
1. statusCodes 키 실측:
   grep -E "statusCodes\." apps/mobile/src/components/SocialAuthButtons.tsx
   grep -E "statusCodes\." apps/mobile/src/services/auth-api.ts
   → 사용 중인 키 확인 후 mock 에 포함

2. google-signin manual mock 신설
   - statusCodes 모든 키 export
   - GoogleSignin / GoogleSigninButton 객체

3. npx jest SocialAuthButtons → CANCELED 5 fails 자동 해소 확인
   - 잔여 toHaveBeenCalled 2 fails 는 mock spy reset 누락 — beforeEach 에 jest.clearAllMocks() 추가

4. A11Y matcher 도입:
   - apps/mobile/package.json 확인 → @testing-library/jest-native 없으면 추가 (또는 prop 검증 fallback)
   - _setup.ts 맨 위에 import '@testing-library/jest-native/extend-expect'

5. npx jest SongListItem S07SongSelectScreen → A11Y 3 fails 해소

6. 회귀: npx jest 전체 ≥ 502 + 10 (본 batch 흡수) PASS
```

---

## 결정 근거

**왜 manual mock 우선?**
`__mocks__/<module>.ts` 패턴은 jest 자동 인식 + 모든 테스트 파일에 자동 적용. `jest.mock()` per-file 호출 회피 → 코드 중복 0. epic-09 batch 1 의 `__esModule: true` 패턴 일관성도 유지 가능 (manual mock 은 ES module 인터럽 자동 처리).

**왜 인프라 batch 분리 (vs Story 4 통합)?**
google-signin mock + A11Y matcher 도입은 *공통 인프라* — 영향 범위가 SocialAuthButtons / SongListItem / S07 *외에도* 다른 잠재 suites 가 자동 흡수 가능. 분산 fails (impl/06) 보다 먼저 통과시켜 review surface 줄임 + impl/06 의 실제 잔여 fails 정확히 측정.

**왜 `@testing-library/jest-native` 의존성 검증 필요?**
v12 (testing-library/react-native) 에서 일부 matcher 가 deprecated. fallback 으로 prop 직접 검증 가능. package.json 확인 후 결정.

---

## 다른 모듈과의 경계

- `_setup.ts`: 본 batch + impl/03 모두 수정 대상 — 충돌 가능성. impl/03 (expo-audio mock) 와 합쳐도 무방하지만 SRP 분리.
- impl/06 (분산 fix): 본 batch 가 흡수하지 못한 D-2~D-7, D-9 만 처리
- 메인 코드 (`src/components/SocialAuthButtons.tsx`): 변경 금지 — mock 만 수정

---

## 수용 기준

- (TEST) `npx jest src/__tests__/components/SocialAuthButtons.test.tsx` 0 failures (7 → 0)
- (TEST) `npx jest src/__tests__/components/SongListItem.test.tsx` A11Y fail 0건
- (TEST) `npx jest src/__tests__/screens/S07SongSelectScreen.test.tsx` A11Y fail 0건
- (TEST) `npx jest 2>&1 | grep "CANCELED"` 0건
- (TEST) 회귀: ≥ 502 PASS

---

## MODULE_PLAN_READY
