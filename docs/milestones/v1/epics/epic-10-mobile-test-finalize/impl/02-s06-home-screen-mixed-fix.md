---
depth: std
---

# impl/02 — [Story 1b / #167] S06HomeScreen 통합 fix (A 6 + B 1 + C 3 + I 1 = 11 fails)

**Story:** #167 (Story 1b — S06 전체 11 fails)
**선행 조건:** 없음 (병렬 가능 batch)
**후행 조건:** S06HomeScreen 0 failures

**context budget:** file edits ≤ 4 / tool uses ≤ 35

---

## 0. 시작 전 fail 분류 재확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npx jest src/__tests__/screens/S06HomeScreen.test.tsx 2>&1 | grep "●" | head -15
```

기대 분류:
- A (6): `Element type is invalid ... got: object`
- B (1): `expect(received).toContain(expected)` text query 실패
- C (3): `Can't access .root on unmounted test renderer`
- I (1): 분산 (실측으로 확인)

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/screens/S06HomeScreen.test.tsx` — 단일 파일 통합 fix (A + B + C + I 모두)

(공통 mock 추출 / `_setup.ts` 변경 금지 — 본 파일은 `react-native` 수동 최소 mock + `react-test-renderer` 패턴이라 격리 유지 필요.)

---

## 인터페이스

### A fix — 컴포넌트 mock 함수형 + `__esModule: true`

```ts
jest.mock('@components/X', () => ({
  __esModule: true,
  default: () => null,
  X: () => null,
}));
```

### B fix — text query regex 또는 findByText

```ts
// before
getByText('자장가 시작')

// after — 화이트스페이스 / 다중 텍스트 노드 회피
getByText(/자장가\s*시작/)
// 또는 비동기
await findByText(/자장가\s*시작/)
```

### C fix — 명시적 unmount + waitFor

```ts
it('unmount safe', async () => {
  const { root, unmount } = render(<S06HomeScreen />);
  await waitFor(() => { /* async setState 완료 대기 */ });
  // assertion
  unmount();
});

afterEach(() => {
  cleanup();
});
```

### I fix — 실측 fail 메시지 기반 individual fix

---

## 의사코드

```
1. fail 메시지 11건 분류 → A 6 / B 1 / C 3 / I 1 (실측 확인)

2. A 6 fails: 등장 컴포넌트 mock factory 모두 함수형 + __esModule: true 로 교체
   - jest.mock('@components/...', () => ({ __esModule: true, default: () => null, ... }))

3. C 3 fails: it 단위로 unmount() 명시 + await waitFor() 추가
   - afterEach(() => cleanup()) 보강 (이미 있으면 skip)

4. B 1 fail: text query 패턴 변환 (literal → regex 또는 findByText)

5. I 1 fail: 메시지 분석 후 최소 수정

6. npx jest S06HomeScreen → 0 failures
7. 회귀: npx jest 전체 ≥ 502 PASS
```

---

## 결정 근거

**왜 단일 파일 batch?**
S06HomeScreen 의 11 fails 가 4 카테고리에 분산되지만, 같은 파일 내 SRP. mock 변경 / cleanup 패턴 / query 변환이 동일 파일의 testing convention 정합 필요. 분리 시 review 횟수만 증가.

**왜 `react-native` 수동 mock 유지?**
이 파일은 epic-09 이전부터 `react-native` 를 직접 mock + `react-test-renderer` 사용. jest-expo 전역 mock 으로 마이그레이션은 대규모 변경 (회귀 위험) — epic 10 범위 밖. 본 batch 는 *기존 패턴 위에 fail fix 만* 한다.

**왜 공통 mock 추출 보류?**
impl/01 (S04/S05) 와 mock 시스템이 다름. 추출 시 S06 격리 깨짐.

---

## 다른 모듈과의 경계

- impl/01 (S04/S05): 같은 카테고리 A 지만 mock 시스템 분리 유지
- `_setup.ts`: 변경 금지 — 본 파일이 자체 mock 으로 setup 우회
- impl/05 (A11Y matcher): A11Y matcher 도입은 별 batch — 본 파일이 `toHaveAccessibilityState` 사용 시 잠재 의존, 실측 후 결정

---

## 수용 기준

- (TEST) `npx jest src/__tests__/screens/S06HomeScreen.test.tsx` 0 failures (11 → 0)
- (TEST) `npx jest 2>&1 | grep -E 'Tests:.*passed'` ≥ 502 (회귀 보호)

---

## MODULE_PLAN_READY
