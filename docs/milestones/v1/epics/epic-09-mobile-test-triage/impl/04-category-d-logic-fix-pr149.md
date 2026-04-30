---
depth: std
---

# impl/04 — 카테고리 D: 실제 로직 fail fix + PR #149 통합 검증

**Story:** #161 (카테고리 D: ~16 fails + PR #149 이어폰 모달 12 it)
**선행 조건:** impl/03 완료 (카테고리 A·B·C 모두 0 fails)
**후행 조건:** `npm test` 0 failures → PR #149 merge 가능

**context budget:** file edits ≤ 20 / tool uses ≤ 60
- D 개별 로직 fix (engineer 호출)
- PR #149 rebase + 검증 (메인 Claude가 git 작업, engineer는 코드 fix에 집중)
- 필요 시 두 호출로 분리 권장

---

## 알려진 D 케이스

### D-1: S10RecordScreen.bgm — stopBgm 미호출 (3건)

**파일:** `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx`

**실패 케이스 (예상):**
- `'녹음 종료(수동 정지) → stopBgm 호출 후 Preview 화면 이동'`
- `'✕ 취소 → stopBgm 호출'`
- `'다시 녹음 → stopBgm 후 카운트다운 재시작'`

**triage 절차:**
```bash
npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx 2>&1 | grep "FAIL\|●"
```

**원인 후보:**
1. `RecordScreen.tsx` 컴포넌트에서 녹음 정지/취소/재시작 핸들러가 `stopBgm()` 을 호출하지 않음 → 컴포넌트 로직 추가
2. 테스트의 `stopBgmMock` 설정 순서 오류 → `beforeEach` 에서 `applyBgmImpl()` 재호출 확인

**수정 파일 (triage 후 결정):**
- `apps/mobile/src/screens/RecordScreen.tsx` — 핸들러 내 `stopBgm()` 호출 누락 시 추가
- `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` — mock 설정 오류 시 수정

### D-2: S01SplashScreen — async clearAuth + Auth 이동 타이밍 (1건)

**파일:** `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx`

**실패 케이스 (예상):**
카테고리 A·C fix 후에도 남는 `clearAuth` 후 `replace('Auth')` assertion 타이밍 fail.

**수정 방법:**
```ts
// 기존
await advanceSplash();
expect(mockClearAuth).toHaveBeenCalledTimes(1);
expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');

// 수정 — waitFor로 async 완료 대기
await advanceSplash();
await waitFor(() => {
  expect(mockClearAuth).toHaveBeenCalledTimes(1);
  expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');
});
```

**주의:** S01의 `advanceSplash()` 가 이미 `act` + `Promise.resolve()` 5회 flush 포함.
cat A fix 후 이 파일이 자연스럽게 GREEN이 될 수도 있음 — triage 먼저.

### D-3: 기타 잔여 fails (~12건)

Story 1~3 완료 후 `npm test` 실행하여 잔여 fails 목록 확인.
각 파일별 개별 triage → 유형 분류 → 최소 수정 적용.

**triage 명령:**
```bash
npm test 2>&1 | grep "● " | head -30
```

---

## PR #149 이어폰 모달 통합 절차

**PR 브랜치:** `feat/149-batch4-record-guide-pivot`
**대상 파일:** `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.*.test.tsx` (이어폰 모달 12 it)

**절차 (메인 Claude가 git 작업):**

```bash
# Step 1: Epic 09 모든 story merge 완료 확인
git checkout main && git pull

# Step 2: PR #149 브랜치 rebase
git checkout feat/149-batch4-record-guide-pivot
git rebase main

# Step 3: conflict 확인
# - 있으면 engineer 호출하여 코드 conflict 해소
# - 없으면 바로 Step 4

# Step 4: 테스트 실행
cd apps/mobile && npm test
# → PR #149 이어폰 모달 12 it GREEN 확인

# Step 5: push + PR #149 merge
git push --force-with-lease origin feat/149-batch4-record-guide-pivot
```

**이어폰 모달 12 it 예상 내용:**
- 첫 진입 시 이어폰 경고 모달 1회 노출
- `@jajang:earphone_warning_dismissed` 저장 후 재진입 미노출
- 모달 dismiss 핸들러 동작

**이 12 it 은 현재 main에 없으므로** Epic 09 fix가 적용된 main 위에서 rebase해야 GREEN 가능.

---

## 수정 파일 목록

| 파일 | 변경 내용 | 조건 |
|---|---|---|
| `apps/mobile/src/screens/RecordScreen.tsx` | stopBgm 호출 누락 시 핸들러 추가 | D-1 triage 결과 |
| `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` | mock 설정 오류 시 수정 | D-1 triage 결과 |
| `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` | waitFor 래핑 추가 | D-2 triage 결과 |
| D-3 triage 결과 파일들 | 개별 수정 | triage 후 결정 |
| PR #149 브랜치 내 파일 | rebase conflict 해소 | conflict 발생 시 |

---

## 의사코드 (수정 절차)

```
1. npm test 실행 (cat A·B·C 완료 후 전체 잔여 확인)
   npm test 2>&1 | grep "● " | head -50

2. D-1 triage
   npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx
   → FAIL it 목록 확인
   → RecordScreen.tsx 핸들러 확인: stopBgm 호출 위치
   → 컴포넌트 fix 또는 mock 설정 fix

3. D-2 triage
   npm test apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx
   → FAIL 있으면 waitFor 래핑 추가
   → PASS면 skip

4. D-3 triage
   잔여 fails 개별 분석 + 최소 수정

5. npm test 결과 0 failures 확인

6. PR #149 rebase (메인 Claude 수행)
   git checkout feat/149-batch4-record-guide-pivot
   git rebase main
   conflict 해소 후 npm test GREEN

7. PR #149 merge
```

---

## 주의사항

**RecordScreen.tsx 수정 시:**
- stopBgm은 async 함수. 핸들러 내에서 `await stopBgm()` 후 navigate 호출해야 테스트의
  `stopBgmMock.mock.invocationCallOrder[0] < navigateMock.mock.invocationCallOrder[0]` 통과
- `useBgmPlayer` hook의 `stopBgm` prop이 `async () => void` 임을 확인

**PR #149 rebase conflict 가능성:**
- S09RecordGuideScreen.tsx 또는 관련 hook 수정이 Epic 09와 겹치면 conflict 가능
- engineer는 코드 conflict 해소만 담당, git 조작(push --force-with-lease)은 메인 Claude

---

## 결정 근거

**옵션 a (rebase) 채택 이유:**
- Epic 09 mock fix가 PR #149 이어폰 모달 12 it에도 적용된 상태로 통합 검증 가능
- main 선 merge 후 자동 흡수(옵션 b)는 PR #149 자체 테스트 실행 없이 merge될 위험

---

## 수용 기준

- (TEST) `npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` GREEN
- (TEST) `npm test apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` GREEN
- (TEST) `npm test` 전체 0 failures
- (TEST) PR #149 이어폰 모달 12 it 전체 GREEN (rebase 후 `npm test`)
- (MANUAL) `npm test -- --coverage` 0 exit code
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 442
