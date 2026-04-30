---
depth: std
---

# impl/01 — [Story 1a / #167] S04+S05 컴포넌트 mock `__esModule: true` + 함수형 통일

**Story:** #167 (Story 1a — 카테고리 A 27 fails)
**선행 조건:** 없음 (병렬 가능 batch)
**후행 조건:** S04SignupScreen / S05LoginScreen 0 failures

**context budget:** file edits ≤ 6 / tool uses ≤ 30

---

## 0. 시작 전 fail 패턴 재확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npx jest src/__tests__/screens/S04SignupScreen.test.tsx 2>&1 | grep "●" | head -20
npx jest src/__tests__/screens/S05LoginScreen.test.tsx 2>&1 | grep "●" | head -20
```

기대: `Element type is invalid: expected a string ... but got: object` 27건 (S04 14 + S05 13).

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/screens/S04SignupScreen.test.tsx` — 컴포넌트 mock 함수형 + `__esModule: true` 첫 키
- `apps/mobile/src/__tests__/screens/S05LoginScreen.test.tsx` — 동일

(공통 `__mocks__/` 추출은 본 batch 에서 보류 — S06 (impl/02) 의 react-native 수동 mock 와 충돌 위험. 추출은 epic 종료 후 follow-up.)

---

## 인터페이스

### mock factory 표준 패턴 (named + default 동시 export)

```ts
jest.mock('@components/SocialAuthButtons', () => ({
  __esModule: true,                                         // 첫 번째 키 (강제)
  default: () => null,                                      // default import 대비
  SocialAuthButtons: () => null,                            // named import 대비
}));
```

### 영향 mock 후보 (실측 grep 후 결정)

```bash
grep -E "jest\.mock\(.*['\"]\@components" apps/mobile/src/__tests__/screens/S04SignupScreen.test.tsx
grep -E "jest\.mock\(.*['\"]\@components" apps/mobile/src/__tests__/screens/S05LoginScreen.test.tsx
```

각 mock 의 factory 가 JSX 객체 (`<></>`) 또는 React.Element 를 반환하는 경우 함수 (`() => null`) 로 교체.

---

## 의사코드

```
1. S04SignupScreen.test.tsx:
   - jest.mock('@components/X', () => <jsx/>)  → 함수형 + __esModule: true 로 교체
   - 14 fails 의 stack trace 에 등장하는 컴포넌트만 우선 수정

2. npx jest S04SignupScreen → 0 failures 확인

3. S05LoginScreen.test.tsx 동일 적용

4. npx jest S05LoginScreen → 0 failures 확인

5. 회귀 검증:
   npx jest 2>&1 | grep -E "Tests:.*passed" → ≥ 502
```

---

## 결정 근거

**왜 함수형 + `default` + named 동시 export?**
실제 컴포넌트 import 패턴이 `import SocialAuthButtons from ...` (default) 와 `import { SocialAuthButtons } from ...` (named) 모두 존재 가능. 둘 다 받아야 안전. epic-09 batch 1 (`__esModule: true`) 패턴을 컴포넌트 mock 에도 일관 적용.

**왜 `() => null` 이 안전한가?**
RN Fabric renderer 가 mock 컴포넌트를 element type 으로 평가할 때 함수만 허용. 객체 (JSX literal 결과) 는 `Element type is invalid: ... got: object` throw. `null` 반환은 children 렌더 차단 + 하위 mock 의존성 cascade 회피.

**왜 공통 `__mocks__/` 추출 보류?**
S06HomeScreen (impl/02) 가 `react-native` 수동 최소 mock + react-test-renderer 를 사용 → 공통 mock 도입 시 S06 의 격리 깨짐. 분리 유지.

---

## 다른 모듈과의 경계

- impl/02 (S06): mock 패턴 다름 (수동 react-native mock) — 본 batch 의 변경 영향 없음
- impl/05 (google-signin infra): SocialAuthButtons.test.tsx 는 별 batch — 충돌 없음
- jest setup (`_setup.ts`): 본 batch 에서 변경 금지

---

## 수용 기준

- (TEST) `npx jest src/__tests__/screens/S04SignupScreen.test.tsx` 0 failures
- (TEST) `npx jest src/__tests__/screens/S05LoginScreen.test.tsx` 0 failures
- (TEST) `npx jest 2>&1 | grep -E 'Tests:.*passed'` ≥ 502 (회귀 보호)

---

## MODULE_PLAN_READY
