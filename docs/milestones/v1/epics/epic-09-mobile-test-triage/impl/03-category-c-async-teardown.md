---
depth: std
---

# impl/03 — 카테고리 C: async teardown cleanup (unmount + waitFor + timer)

**Story:** #160 (카테고리 C: ~23 fails — `import after Jest env torn down`)
**선행 조건:** impl/02 완료 (카테고리 B 0 fails)
**후행 조건:** impl/04 (카테고리 D) 시작 가능

**context budget:** file edits ≤ 20 / tool uses ≤ 60 — 단일 호출 가능 (영향 파일 소수)

---

## 근본 원인

`useEffect` / `Promise` 체인이 컴포넌트 unmount 이후에도 resolve되어
jest 환경(모듈 레지스트리)이 이미 해제된 상태에서 모듈 import를 시도함.
jest-expo의 async polyfill과 fake timer가 함께 쓰일 때 특히 발생.

**진단 명령:**
```bash
npm test 2>&1 | grep "torn down"
```

---

## 수정 전략

원인 유형별 3가지 처리:

**유형 1 — unmount 후 Promise 생존**
테스트 마지막에 `unmount()` 명시 + `await Promise.resolve()` flush

**유형 2 — fake timer + async Promise 충돌**
`jest.runAllTimers()` + `await Promise.resolve()` 조합으로 pending 비동기 소진

**유형 3 — afterEach cleanup 누락**
```ts
afterEach(async () => {
  jest.runAllTimers();
  jest.clearAllTimers();
  cleanup(); // @testing-library/react-native
});
```

**유형 4 — useFakeTimers afterEach 미복구**
`jest.useFakeTimers()` 를 beforeEach/it에서 쓰는 파일:
```ts
afterEach(() => {
  jest.useRealTimers();
});
```

---

## 수정 파일 목록

grep 결과로 최종 확정. 현재 알려진 잠재 대상:

| 파일 | 예상 유형 | 변경 내용 |
|---|---|---|
| `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` | 유형 1+2 | `waitFor` 대기 후 `unmount()` 명시 + `afterEach` 추가 |
| `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.refactor.test.tsx` | 유형 1+2 | 동일 |
| `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` | 유형 2+4 | `afterEach` 에 `jest.runAllTimers()` 추가 확인 (이미 `useRealTimers` 있음 — 충분한지 확인) |
| `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` | 유형 4 | `afterEach useRealTimers` 이미 있음 — torn down 잔여 시 `unmount()` 추가 |
| 그 외 grep 결과 파일 | 유형별 분류 | 동일 패턴 적용 |

---

## 의사코드 (수정 절차)

```
1. npm test 2>&1 | grep "torn down" 으로 정확한 영향 파일 목록 확인
   → 파일명 + it description 기록

2. 각 파일별 유형 분류:
   - useFakeTimers 사용 여부 확인
   - useEffect/async Promise 포함 여부 확인
   - afterEach cleanup/useRealTimers 존재 여부 확인

3. 유형별 수정 적용:

   [유형 1] unmount 미호출
   it('test', async () => {
     const { getByText, unmount } = render(<Screen />)
     await waitFor(() => { /* 비동기 완료 */ })
     unmount()  // 추가
   })

   [유형 2] fake timer + async 충돌
   afterEach(async () => {
     jest.runAllTimers()
     await Promise.resolve()  // microtask flush
     cleanup()
   })

   [유형 3] afterEach 누락
   afterEach(() => {
     jest.runAllTimers()
     jest.clearAllTimers()
     cleanup()
   })

   [유형 4] useRealTimers 미복구
   afterEach(() => {
     jest.useRealTimers()
   })

4. 각 파일 npm test <파일> GREEN 확인

5. npm test 2>&1 | grep "torn down" 결과 0건 확인
```

---

## 주의사항

- `cleanup()` import: `import { cleanup } from '@testing-library/react-native'`
- `jest.runAllTimers()` 은 fake timer 활성 상태에서만 의미있음.
  실제 timer 상태에서 호출해도 no-op이므로 항상 추가해도 안전.
- `await act(async () => { jest.runAllTimers(); await Promise.resolve(); })`
  패턴이 가장 안전. 이미 S10, S01 에서 사용 중.
- S09 파일이 async `getRandomPhrase` mock을 쓰므로 `await waitFor` 완료 확인 필수.

---

## 결정 근거

`import after Jest env torn down` 은 jest가 모듈 레지스트리를 먼저 해제하는 race condition.
해결의 핵심은 "테스트 종료 전 모든 async 체인이 resolve/reject 완료되는 것을 보장".
컴포넌트 자체를 수정하는 것보다 테스트 teardown 보강이 최소 변경.

---

## 수용 기준

- (TEST) `npm test 2>&1 | grep "torn down"` 결과 0건
- (TEST) 카테고리 C 영향 파일 각각 `npm test <파일>` GREEN
- (MANUAL) `npm test` 실행 후 총 fails 수 이전 대비 ~23 감소
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442
