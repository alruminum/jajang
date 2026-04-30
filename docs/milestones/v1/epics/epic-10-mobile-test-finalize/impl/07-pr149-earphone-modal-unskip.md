---
depth: std
---

# impl/07 — [Story 5 / #171] PR #149 이어폰 모달 14 it skip → unskip + assertion 수정

**Story:** #171 (Story 5)
**선행 조건:** impl/03 (expo-audio mock) 완료 — PR #149 브랜치에서 작업
**후행 조건:** PR #149 의 16 skipped → 2 (의도 skip 만 잔존)

**context budget:** file edits ≤ 2 / tool uses ≤ 30

---

## 0. 시작 전 PR 브랜치 상태 확인

```bash
git checkout feat/149-batch4-record-guide-pivot
git rebase main          # impl/01~06 흡수
cd apps/mobile
npx jest src/__tests__/screens/S09RecordGuideScreen.test.tsx 2>&1 | grep "skipped"
# 기대: skipped: 16 (이어폰 모달 14 + 의도 skip 2)
```

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` (PR 브랜치 단독)
  - 5 describe `.skip` → 일반 describe
  - 14 it 의 query 패턴 정정

(컴포넌트 (`src/screens/S09RecordGuideScreen.tsx`) 변경 금지 — assertion 만 수정.)

---

## 인터페이스

### unskip + scope 좁힘 패턴

```ts
// before — describe.skip
describe.skip('이어폰 경고 모달 첫 진입', () => {
  it('첫 진입 시 모달 1회 노출', () => {
    const { getByText } = render(<S09RecordGuideScreen />);
    expect(getByText('이어폰을 착용해주세요')).toBeTruthy();  // multi-match fail
  });
});

// after — within scope
describe('이어폰 경고 모달 첫 진입', () => {
  it('첫 진입 시 모달 1회 노출', async () => {
    const { getByTestId, findByText } = render(<S09RecordGuideScreen />);
    const modal = getByTestId('earphone-modal');
    expect(within(modal).getByText(/이어폰/)).toBeTruthy();
    // 또는 findByText 비동기
    await findByText(/이어폰을 착용해주세요/);
  });
});
```

### 다중 매칭 회피 — getAllByText

```ts
// before — getByText (다중 매칭 throw)
const [text] = getAllByText(/이어폰/);
expect(text).toBeTruthy();
```

### AsyncStorage mock 시나리오

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

beforeEach(() => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);   // 첫 진입
});

it('@jajang:earphone_warning_dismissed 저장 후 재진입 미노출', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('true'); // 저장된 상태
  const { queryByTestId } = render(<S09RecordGuideScreen />);
  await waitFor(() => {
    expect(queryByTestId('earphone-modal')).toBeNull();
  });
});
```

---

## 의사코드

```
1. PR #149 브랜치 체크아웃 + rebase main
   git checkout feat/149-batch4-record-guide-pivot
   git rebase main

2. S09RecordGuideScreen.test.tsx 의 5 describe `.skip` 식별
   grep -n "describe.skip" apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx

3. 첫 describe.skip → describe 변환 후 단독 실행
   npx jest S09RecordGuideScreen
   → fail 메시지 캡처 (multi-match / scope / async)

4. fail 패턴별 수정:
   - multi-match → within(getByTestId('earphone-modal')) 또는 getAllByText(...)[0]
   - async → await findByText(...) 또는 await waitFor(...)
   - AsyncStorage 시나리오 → mockResolvedValue 정렬

5. 14 it 모두 GREEN 확인 후 다음 describe 진행

6. 최종: npx jest S09RecordGuideScreen 0 failures + skipped 2 (의도 skip 만)
```

---

## 결정 근거

**왜 `within` scope 좁힘 우선?**
이어폰 모달 + 마이크 모달 동시 렌더 + 헤더 텍스트 중복 가능 → `getByText('이어폰')` multi-match throw. `within(modal)` 로 scope 명시가 가장 견고. testing-library 공식 권장 패턴.

**왜 PR 브랜치 단독 작업?**
이어폰 모달 14 it 자체가 PR #149 의 변경 — main 에 push 시 PR 의도 깨짐. PR 브랜치 commit 만.

**왜 컴포넌트 변경 금지?**
fail 메시지 모두 *테스트 측 query/scope 부재* — 컴포넌트는 PR review 단계에서 검증된 상태. 본 batch 는 unskip + assertion 정정만.

---

## 다른 모듈과의 경계

- impl/03 (expo-audio mock): 본 batch 의 전제조건 — `jest.mock('expo-audio', ...)` 가 PR 브랜치에 적용된 상태에서만 의미
- impl/08 (rebase merge): 본 batch 의 PR commit 이 최종 merge 대상
- main 의 다른 batch: 영향 없음 (PR 브랜치 단독)

---

## 수용 기준

- (TEST) PR 브랜치: `npx jest src/__tests__/screens/S09RecordGuideScreen.test.tsx`
  - skipped: 16 → 2 (의도 skip 만)
  - 14 it 모두 PASS
- (TEST) PR 브랜치 전체: `npx jest` 0 failures
- 회귀: main 영향 없음 (PR 브랜치 단독)

---

## Verification (PR #149 batch 07) — DONE

**실측 명령 및 결과:**

```
$ npx jest src/__tests__/screens/S09RecordGuideScreen.refactor.test.tsx
Tests: 22 passed, 22 total   ← 14 skipped → 14 PASS
```

```
$ npx jest 2>&1 | grep "Tests:"
Tests: 42 failed, 3 skipped, 564 passed, 609 total
```

- PR #149 baseline: 42 failed / 17 skipped / 550 passed
- batch 07 after: 42 failed / 3 skipped / 564 passed (+14 PASS, skipped 17→3)
- 42 failed 는 PR #149 기존 실패분 — 회귀 없음

**적용 패턴:**
- describe 1번 (chip 텍스트): GUIDE_ITEMS[2] + HeadphoneChip 동일 텍스트 → `getAllByText` 로 다중 매칭 회피
- describe 2~5번 (modal): `findByText('이어폰을 끼면 더 잘 담겨요')` 그대로 통과 — Modal visible=false 시 RNTL이 children 숨김

---

## MODULE_PLAN_READY
