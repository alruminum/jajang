# Epic 09 — Mobile Test Triage: Jest 잔여 156 fails 정리

**목표:** Epic 08 (vitest → jest-expo 마이그레이션) 완료 후 잔여 156 test fails 카테고리별 정리. PR #149 (이어폰 모달 12 it 포함) merge 가능 상태로 만듦.
**선행 조건:** Epic 08 완료 (main: 28 suites PASS / 442 tests PASS ~74%, 19 suites + 156 tests FAIL)
**완료 기준:** `npm test` 전체 suite 0 failures.

**GitHub Epic Issue:** [#157](https://github.com/alruminum/jajang/issues/157)

---

## fail 카테고리 요약

| 카테고리 | 오류 패턴 | 예상 fails | 원인 요약 |
|---|---|---|---|
| A | `useAuthStore is not a function` | ~78 | jest mock factory ES module interop 미충족 |
| B | `stopPropagation` of undefined | ~39 | jest-expo RN mock에서 event 객체 undefined |
| C | `import after Jest env torn down` | ~23 | useEffect/Promise unmount 후 생존 |
| D | 실제 로직 오류 + PR #149 검증 | ~16 | stopBgm 미호출 등 개별 케이스 |

---

## Story 1 — 카테고리 A: 스토어 mock factory `__esModule: true` 패턴 수정

**As a** 개발자
**I want** zustand store mock이 jest ES module interop에서 올바르게 동작하길 원한다
**So that** store를 사용하는 컴포넌트 테스트에서 `is not a function` 오류가 사라진다

**GitHub Issue:** [#158](https://github.com/alruminum/jajang/issues/158)

### 근본 원인

기존 `jest.mock('@store/authSlice', () => ({ useAuthStore: jest.fn() }))` 패턴이 babel 변환 시 `(0, _authSlice.useAuthStore)` getter로 변환되면 undefined를 반환. `__esModule: true` 플래그 누락이 원인.

**영향 파일 (sample):** CompletedTrackCard, S04SignupScreen, S05LoginScreen, S06HomeScreen, AccountDeletionScreen 등 store 사용 컴포넌트 전체

### 실측 store mock import 경로 3가지

코드베이스에서 store mock이 3가지 경로로 분포되어 있으며, 각각 `__esModule: true` 패턴을 적용해야 한다:

| 경로 | 사용 위치 (sample) | 비고 |
|---|---|---|
| `@store/authSlice` | S07, S08 등 — re-export hub | 가장 흔한 패턴 |
| `@store/auth-store` | TrialBadge, TrialExpiryBanner, S06HomeScreen | 실제 정의 파일 직접 참조 |
| `@store` | S16SettingsScreen, SettingsScreen, AccountDeletionScreen | index re-export |

**path 분포 확인 단계 (engineer 필수):**
```bash
# 78 fails 의 경로 분포 확인 — 수정 전 반드시 실행
npm test 2>&1 | grep "is not a function" | grep -oP "@store/[^\s']+" | sort | uniq -c
# 또는
grep -rl "jest.mock.*@store" apps/mobile/src/__tests__ | xargs grep -h "jest.mock.*@store" | sort | uniq -c
```

**`__esModule: true` 적용 위치:** 각 mock factory 의 첫 번째 키로 배치.

```ts
// before (동작 안 함)
jest.mock('@store/authSlice', () => ({
  useAuthStore: jest.fn(),
}));

// after — __esModule: true 를 factory 첫 키로 (세 경로 모두 동일 패턴)
jest.mock('@store/authSlice', () => ({
  __esModule: true,                          // ← 반드시 첫 번째
  useAuthStore: jest.fn(() => mockAuthState),
}));

// @store/auth-store 경로 예시
jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => mockAuthState),
}));

// @store index 경로 예시
jest.mock('@store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => mockAuthState),
}));
```

### 태스크 체크리스트

- [x] `npm test 2>&1 | grep "is not a function"` 로 전체 영향 파일 목록 확인
- [x] 위 grep 명령으로 78 fails 의 `@store/authSlice` / `@store/auth-store` / `@store` 경로 분포 확인 후 진행
- [x] 공통 mock 패턴 결정 (option 1: `__esModule: true` 직접 / option 2: `jest.requireActual` 혼합) + `__mocks__/` 공통화 가능 여부 검토
- [x] 영향 파일별 mock factory `__esModule: true` 첫 번째 키 추가 또는 공통 mock으로 교체
- [x] `useTrackStore` — `grep -rl "useTrackStore" apps/mobile/src/__tests__` 로 영향 파일 확인 + 동일 패턴 적용
- [x] `useSubscriptionStore` — 동일하게 grep 확인 + 적용
- [x] 수정 후 카테고리 A 해당 파일 각각 `npm test <파일>` GREEN 확인

### 수용 기준

- (TEST) 카테고리 A 영향 파일 각각 `npm test <파일>` GREEN
- (TEST) `npm test 2>&1 | grep "is not a function"` 결과 0건
- (MANUAL) `npm test` 전체 실행 후 카테고리 A 유발 fails 카운트 0
- **회귀 보호**: 기존 PASS 442 tests 모두 PASS 유지 (`npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442)

---

## Story 2 — 카테고리 B: 이벤트 핸들러 mock event 객체 전달 수정

**As a** 개발자
**I want** fireEvent.press 시 mock event 객체가 올바르게 전달되길 원한다
**So that** `event.stopPropagation()` 호출에서 undefined 참조 오류가 사라진다

**GitHub Issue:** [#159](https://github.com/alruminum/jajang/issues/159)

### 근본 원인

jest-expo preset의 react-native mock이 `Pressable` 등을 string export 처리. 실제 onPress event 객체가 undefined로 전달되어 `event.stopPropagation()` 호출 시 crash.

**영향 파일 (sample):** SongListItem, TrackCard, EmptyTrackState, TrialBadge 테스트

### 수정 패턴

```ts
// before
fireEvent.press(element);

// after — mock event 객체 명시
fireEvent.press(element, {
  nativeEvent: {},
  stopPropagation: jest.fn(),
  preventDefault: jest.fn(),
});
// 또는: 컴포넌트 핸들러에서 불필요한 event.stopPropagation() 제거
```

### 태스크 체크리스트

- [x] `npm test 2>&1 | grep "stopPropagation"` 로 전체 영향 파일 목록 확인
- [x] 각 파일별 원인 분류: (a) 테스트 fireEvent 호출 시 event 객체 누락 → mock event 전달 / (b) 컴포넌트가 불필요하게 `event.stopPropagation()` 호출 → 핸들러 단순화
- [x] `@testing-library/react-native` v12 `fireEvent` 공식 시그니처 확인 후 올바른 mock event 구조 적용
- [x] 영향 파일 전체 수정 + 각 파일 GREEN 확인

### 수용 기준

- (TEST) 카테고리 B 영향 파일 각각 `npm test <파일>` GREEN
- (TEST) `npm test 2>&1 | grep "stopPropagation"` 결과 0건
- (MANUAL) `npm test` 전체 실행 후 카테고리 B 유발 fails 카운트 0
- **회귀 보호**: 기존 PASS 442 tests 모두 PASS 유지 (`npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442)

---

## Story 3 — 카테고리 C: async teardown cleanup (unmount + waitFor)

**As a** 개발자
**I want** async 컴포넌트 테스트가 jest 환경 해제 전에 올바르게 cleanup되길 원한다
**So that** "import after Jest env torn down" 오류가 사라진다

**GitHub Issue:** [#160](https://github.com/alruminum/jajang/issues/160)

### 근본 원인

`useEffect`/Promise가 컴포넌트 unmount 후에도 살아있는 상태에서 jest fake timer와 jest-expo RN async polyfill이 충돌. jest 환경이 컴포넌트 cleanup 전에 먼저 torn down됨.

**영향 파일 (sample):** S09RecordGuideScreen.test.tsx 등 async useEffect 포함 컴포넌트

### 수정 패턴

```ts
// after — 명시적 cleanup + act 래핑
it('test', async () => {
  const { getByText, unmount } = render(<Screen />);
  await waitFor(() => { /* 비동기 상태 완료 대기 */ });
  unmount(); // 명시적 unmount
});

// fake timer 사용 시
afterEach(() => {
  jest.runAllTimers();
  jest.clearAllTimers();
  cleanup(); // @testing-library/react-native cleanup
});
```

### 태스크 체크리스트

- [x] `npm test 2>&1 | grep "torn down"` 로 전체 영향 파일 목록 확인
- [x] 각 파일별 원인 분류: (a) unmount 미호출 → `unmount()` 명시 추가 / (b) fake timer + async Promise 충돌 → `jest.runAllTimers()` + `await Promise.resolve()` / (c) afterEach cleanup 누락 → `cleanup()` 추가
- [x] S09RecordGuideScreen.test.tsx 수정 + GREEN 확인
- [x] 영향 전체 파일 수정 + 각 파일 GREEN 확인
- [x] `jest.useFakeTimers` 사용 파일에 `afterEach(() => jest.useRealTimers())` 보강

### 수용 기준

- (TEST) 카테고리 C 영향 파일 각각 `npm test <파일>` GREEN
- (TEST) `npm test 2>&1 | grep "torn down"` 결과 0건
- (MANUAL) `npm test` 전체 실행 후 카테고리 C 유발 fails 카운트 0
- **회귀 보호**: 기존 PASS 442 tests 모두 PASS 유지 (`npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442)

---

## Story 4 — 카테고리 D: 실제 로직 fail fix + PR #149 mobile 테스트 검증

**As a** 개발자
**I want** 실제 로직 오류로 인한 test fail이 수정되고 PR #149 이어폰 모달 테스트가 통과하길 원한다
**So that** `npm test` 최종 0 failures 달성 + PR #149 merge 가능 상태가 된다

**GitHub Issue:** [#161](https://github.com/alruminum/jajang/issues/161)

### 알려진 카테고리 D 케이스

**D-1: S10RecordScreen.bgm — stopBgm 미호출 (3건)**
- 파일: `src/__tests__/screens/S10RecordScreen.bgm.test.tsx`
- BGM 재생 중 녹음 시작 시 `stopBgm` 호출 assertion 실패
- 수정: 컴포넌트 로직 누락 시 추가 / 테스트 mock 설정 순서 오류 시 수정

**D-2: S01SplashScreen — async clearAuth + Auth 이동 (1건)**
- 파일: `src/__tests__/screens/S01SplashScreen.test.tsx`
- clearAuth 후 Auth 스택 이동 assertion 타이밍 실패
- 수정: `waitFor` + `act` 래핑으로 async 이동 완료 대기

**D-3: 기타 (~12건)**
- Story 1~3 완료 후 잔여 fails 개별 분석

### PR #149 이어폰 모달 테스트 (12 it) 검증

PR #149 `S09RecordGuideScreen` 이어폰 모달 관련 12 it:
- 이어폰 모달 첫 진입 1회 노출
- `@jajang:earphone_warning_dismissed` 저장 후 재진입 미노출
- 모달 dismiss 핸들러 동작

**중요:** PR #149 의 이어폰 모달 12 it 은 현재 main 에 없고 PR 브랜치(`feat/149-batch4-record-guide-pivot`)에만 존재한다. Epic 09 의 mock fix 가 적용된 상태에서 해당 테스트도 GREEN 이어야 한다.

### PR #149 통합 절차

**옵션 (a) — 권장: rebase 방식**

Epic 09 의 마지막 batch (Story 4) merge 완료 후:
1. PR #149 브랜치를 최신 main 으로 rebase (`git rebase main` on `feat/149-batch4-record-guide-pivot`)
2. Epic 09 의 mock fix 가 PR #149 의 이어폰 모달 12 it 에도 적용된 상태 확인
3. `npm test` GREEN (0 failures) 확인 → PR #149 merge

**옵션 (b) — 단순: main 선 merge 후 자동 흡수**

Epic 09 모든 story main merge 완료 시:
- PR #149 가 main 의 새 jest infra + mock fix 위에서 동작 (자동)
- conflict 발생 시 PR #149 author 가 resolve 후 push

**채택: 옵션 (a) 권고.** rebase 로 PR #149 이어폰 모달 12 it 이 Epic 09 fix 와 통합된 상태로 최종 검증 가능.

### 태스크 체크리스트

- [x] Story 1~3 완료 후 `npm test` 실행하여 카테고리 D 잔여 fails 목록 확인
- [x] D-1: S10RecordScreen.bgm stopBgm 3건 triage + fix
- [x] D-2: S01SplashScreen async clearAuth 1건 triage + fix
- [x] D-3: 기타 잔여 fails 개별 triage + fix
- [x] PR #149 브랜치를 최신 main 으로 rebase (옵션 a)
- [x] PR #149 이어폰 모달 12 it 전체 GREEN 확인 (rebase 후 `npm test` 실행)
- [x] `npm test` 최종 0 failures 확인
- [x] PR #149 merge 가능 상태 선언

### 수용 기준

- (TEST) `npm test` 결과 0 failures (19 suites + 156 fails → 0)
- (TEST) `npm test src/__tests__/screens/S10RecordScreen.bgm.test.tsx` GREEN
- (TEST) `npm test src/__tests__/screens/S01SplashScreen.test.tsx` GREEN
- (TEST) PR #149 이어폰 모달 테스트 12 it 전체 GREEN (rebase 후 main 기준)
- (MANUAL) `npm test -- --coverage` 0 exit code
- **회귀 보호**: 기존 PASS 442 tests 모두 PASS 유지 (`npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442)

---

## 의존성 (실행 순서)

**직렬 처리 — 안전 우선.** 각 Story 가 `_setup.ts` 공통 mock 또는 testing-library helper 를 변경할 가능성이 있어 병렬 금지.

```
Story 1 (카테고리 A: 스토어 mock)
  └→ Story 2 (카테고리 B: 이벤트 핸들러)
       └→ Story 3 (카테고리 C: async teardown)
            └→ Story 4 (카테고리 D: 개별 로직 + PR #149)
```

- Story 2 는 Story 1 완료 (카테고리 A 0 fails) 후 시작
- Story 3 는 Story 2 완료 (카테고리 B 0 fails) 후 시작
- Story 4 는 Story 1~3 모두 완료 후 시작 (PR #149 rebase 포함)

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#157](https://github.com/alruminum/jajang/issues/157) |
| Story 1 | [#158](https://github.com/alruminum/jajang/issues/158) |
| Story 2 | [#159](https://github.com/alruminum/jajang/issues/159) |
| Story 3 | [#160](https://github.com/alruminum/jajang/issues/160) |
| Story 4 | [#161](https://github.com/alruminum/jajang/issues/161) |
