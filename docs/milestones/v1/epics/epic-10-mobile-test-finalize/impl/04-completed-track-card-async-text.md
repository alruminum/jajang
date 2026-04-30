---
depth: std
---

# impl/04 — [Story 3 / #169] CompletedTrackCard async cleanup + text query regex (15 fails)

**상태:** DONE (2026-04-30)

**Story:** #169 (Story 3 — C 6 + B 9 = 15 fails)
**선행 조건:** 없음 (병렬 가능 batch)
**후행 조건:** CompletedTrackCard 0 failures

**context budget:** file edits ≤ 2 / tool uses ≤ 25

---

## 0. 시작 전 fail 분류 재확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npx jest src/__tests__/components/CompletedTrackCard.test.tsx 2>&1 | grep "●" | head -20
```

기대 분류:
- C (6): `Can't access .root on unmounted test renderer`
- B (9): `expect(received).toContain(expected) // indexOf` (text query)

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/components/CompletedTrackCard.test.tsx` — 단일 파일

(컴포넌트 (`src/components/CompletedTrackCard.tsx`) 변경 금지 — 본 batch 는 *테스트만* 수정.)

---

## 인터페이스

### C fix — async teardown 패턴

```ts
afterEach(() => {
  cleanup();          // @testing-library/react-native — render 결과 정리
});

it('async test', async () => {
  const { root, unmount } = render(<CompletedTrackCard {...props} />);
  await waitFor(() => {
    // setState 비동기 완료 대기
    expect(root.findAllByType('TouchableOpacity' as any).length).toBeGreaterThan(0);
  });
  // assertion
  unmount();           // 명시적 unmount
});
```

### B fix — text query 패턴

```ts
// before — literal toContain
expect(textNode.children.join('')).toContain('브람스 자장가')

// after — RN18 다중 텍스트 노드 / 화이트스페이스 회피
expect(textNode.children.join('')).toMatch(/브람스\s*자장가/)

// 또는 testing-library API 로 변환
const node = await findByText(/브람스\s*자장가/)
```

### fake timer 보강 (필요 시)

```ts
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});
```

---

## 의사코드

```
1. fail 메시지 15건 분류 → C 6 / B 9 (실측 확인)

2. C 6 fails:
   - afterEach(cleanup) 추가 (없으면)
   - 각 it 마다 명시적 unmount() + await waitFor() 추가
   - useEffect 비동기 setState 완료 대기

3. B 9 fails:
   - getByText('literal') / toContain('literal') 패턴 → regex 변환
   - 화이트스페이스 / 다중 텍스트 노드 분할 회피
   - 비동기 텍스트 등장 시 findByText 사용

4. fake timer 사용 it 에 jest.useRealTimers() 보강 (필요 시)

5. npx jest CompletedTrackCard → 0 failures
6. 회귀: npx jest 전체 ≥ 502 PASS
```

---

## 결정 근거

**왜 컴포넌트 코드 미변경?**
fail 메시지 모두 *테스트 측의 query / cleanup 부재*. 컴포넌트 자체 로직은 정상 (502 PASS 의 다른 컴포넌트가 같은 store 사용 + GREEN). SRP 우선 — 테스트만 수정.

**왜 regex 우선 (vs findByText)?**
이 파일은 `react-test-renderer` + `findAllByType` 패턴을 이미 사용. testing-library `findByText` 와 혼용 시 mental model 분리 비용. regex 변환이 최소 변경.

**왜 명시적 `unmount()`?**
`afterEach(cleanup)` 만으로 부족 — async setState 가 cleanup 시점에 race. it 안에서 명시적 unmount + waitFor 가 안전.

---

## 다른 모듈과의 경계

- impl/02 (S06): 같은 C 카테고리 fix 패턴 — 별 파일이라 충돌 없음
- `_setup.ts`: 변경 금지
- impl/06 (분산): A11Y / 데이터 mismatch 와 무관

---

## 수용 기준

- (TEST) `npx jest src/__tests__/components/CompletedTrackCard.test.tsx` 0 failures (15 → 0)
- (TEST) `npx jest 2>&1 | grep -E 'Tests:.*passed'` ≥ 502 (회귀 보호)

---

## MODULE_PLAN_READY

## Verification

```
npx jest src/__tests__/components/CompletedTrackCard.test.tsx
Tests: 15 passed, 15 total (0 fail)

npx jest 2>&1 | grep "Tests:"
Tests: 41 failed, 2 skipped, 555 passed, 598 total
```

- CompletedTrackCard: 15 → 0 fail (PASS)
- 전체: 540 → 555 PASS (+15), 회귀 없음

### 실제 fix 내용 (impl 계획 대비 차이)

impl 계획은 C(unmounted) + B(text query) 분리 분석이었으나 실측 결과:
- 모든 15 fail 의 공통 근본 원인 = `act()` wrapping 없는 `create()` → 비동기 상태 업데이트가 afterEach cleanup 과 race → 전 테스트 tree 가 다음 테스트에서 unmounted 상태로 접근
- 추가 발견: `findAllByType('TouchableOpacity' as any)` 문자열 타입 비교가 jest-expo preset 환경에서 0 반환 → `import { TouchableOpacity } from 'react-native'` + 실제 컴포넌트 ref 로 `findAllByType(TouchableOpacity)` 로 수정
- `afterEach` 의 `Promise.resolve()` x2 제거 (cleanup 만 유지)
- 모든 `create()` 를 `act()` wrapping `renderTree()` helper 로 통일
