---
depth: std
---

# impl/04 — 카테고리 D: 실제 로직 fail fix + PR #149 통합 검증

**Story:** #161 (카테고리 D: ~16 fails + PR #149 이어폰 모달 12 it)
**선행 조건:** impl/03 완료 (카테고리 A·B·C 모두 0 fails)
**후행 조건:** `npm test` 0 failures → PR #149 merge 가능

**context budget:** file edits ≤ 20 / tool uses ≤ 60

---

## 0. 시작 전 잔여 fails 전수 확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npm test 2>&1 | grep -E "FAIL|● " | head -60
```

아래 D-1 ~ D-3 분류는 코드베이스 실측 기반이나, batch 1~3 완료 직후 실제 출력과 대조하여
실제로 남은 케이스만 처리한다. 이미 GREEN인 항목은 skip.

---

## D-1: S10RecordScreen.bgm — handleCancel stopBgm await 누락

**파일:** `apps/mobile/src/screens/RecordScreen.tsx`

**실측 원인 (코드 확인 완료):**
```ts
// 현재 코드 (line ~207-222)
const handleCancel = () => {
  if (isHummingMode) {
    stopBgm()  // ← await 없음 — fire-and-forget
  }
  Alert.alert(...)
}
```

`stopBgm`은 async 함수. await 없이 호출하면 `stopBgmMock`의
`invocationCallOrder` 추적이 `Alert.alert` 이전에 확정되지 않는다.
또한 Alert mock에서 onPress 콜백을 즉시 호출하는 경우 경쟁 조건 발생.

**수정 대상:** `apps/mobile/src/screens/RecordScreen.tsx`

```ts
// 수정 후 — handleCancel async로 변경
const handleCancel = async () => {
  if (isHummingMode) {
    await stopBgm()  // await 추가
  }
  Alert.alert('녹음을 취소할까요?', '', [
    { text: '계속 녹음', style: 'cancel' },
    {
      text: '취소',
      style: 'destructive',
      onPress: async () => {
        await cleanupRecording();
        navigation.navigate('RecordMode');
      },
    },
  ]);
};
```

**BackHandler 연결부도 확인:** `BackHandler.addEventListener` callback이 `handleCancel`을 호출하는데
BackHandler mock에서 동기 호출할 경우 문제없음 (BackHandler는 테스트에서 mock됨).

**검증:**
```bash
npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx
```

예상 PASS it:
- `✕ 취소 → stopBgm 호출`
- `녹음 종료(수동 정지) → stopBgm 호출 후 Preview 화면 이동`
- `다시 녹음 → stopBgm 후 카운트다운 재시작`

**주의:** `handleStopPress`, `restartRecording` 두 함수는 이미 `await stopBgm()` 사용 중 — 수정 불필요.

---

## D-2: S01SplashScreen — 실측 후 판단

**파일:** `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx`

코드 확인 결과 S01 테스트는 이미 `waitFor` 래핑을 적용한 케이스와 단순 assertion이 혼재.
batch 1 (카테고리 A) fix 후 `@store/auth-store`에 `__esModule: true`가 적용되면
`useAuthStore` 관련 fail은 자동 해소된다.

**triage 절차:**
```bash
npm test apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx 2>&1 | grep "●"
```

PASS면 skip. FAIL 시 fail 메시지 확인 후:
- `is not a function` → batch 1 A fix 미적용 — batch 1 재확인
- 타이밍 오류 → 해당 it에만 `waitFor` 래핑 추가

---

## D-3: 잔여 suites 카테고리별 분류 (코드 실측 기반)

batch 1~3 완료 후 아래 19개 suite 중 실제로 FAIL인 것만 처리.
각 파일의 mock 패턴을 실측했으며 예상 잔여 원인을 분류한다.

### D-3-A: react-native 수동 최소 mock 사용 suite (5개)

이 파일들은 `jest.mock('react-native', () => ({ View: 'View', Text: 'Text', ... }))` 패턴을 사용.
jest-expo preset의 자동 mock를 덮어쓰므로 카테고리 A/B/C fix 영향권 밖.
**별도 독립 실패 가능성 높음.**

| 파일 | 특이사항 |
|---|---|
| `__tests__/components/EmptyTrackState.test.tsx` | `react-native` 수동 최소 mock + `react-test-renderer` |
| `__tests__/components/TrialBadge.test.tsx` | `react-native` 수동 mock, `@store/auth-store __esModule: true` 이미 적용 |
| `__tests__/components/TrialExpiryBanner.test.tsx` | 동일 패턴 |
| `__tests__/screens/S06HomeScreen.test.tsx` | `react-native` 수동 mock + `react-test-renderer/create` |
| `__tests__/AccountDeletionScreen.test.tsx` | `@store __esModule: true` 이미 적용 |

**triage 명령:**
```bash
npm test apps/mobile/src/__tests__/components/TrialBadge.test.tsx 2>&1 | grep "●"
npm test apps/mobile/src/__tests__/components/TrialExpiryBanner.test.tsx 2>&1 | grep "●"
npm test apps/mobile/src/__tests__/components/EmptyTrackState.test.tsx 2>&1 | grep "●"
npm test apps/mobile/src/__tests__/screens/S06HomeScreen.test.tsx 2>&1 | grep "●"
npm test apps/mobile/src/__tests__/AccountDeletionScreen.test.tsx 2>&1 | grep "●"
```

**예상 패턴 및 수정법:**

**(a) `useAuthStore is not a function` 잔류:**
파일 내 mock에 이미 `__esModule: true` 있으면 → mock factory 반환값이 잘못된 것.
`useAuthStore: jest.fn()` 인데 `mockReturnValue` 없이 호출되면 undefined 반환.
`beforeEach`에서 `jest.mocked(useAuthStore).mockReturnValue({ entitlement: 'trial' } as any)` 확인.

**(b) `Cannot find module` / import 오류:**
`react-native` 수동 mock이 `StyleSheet.create` 등 누락 시 → mock 보완.

**(c) `TouchableOpacity` 관련 findByType 실패:**
`react-test-renderer`의 `findByType('TouchableOpacity' as any)` 패턴 — 수동 mock에서
`TouchableOpacity: 'TouchableOpacity'` 문자열 컴포넌트로 설정됐는지 확인.

### D-3-B: data/bgmTracks suite

**파일:** `apps/mobile/src/__tests__/data/bgmTracks.test.ts`

테스트가 `getBgmTrackMeta` 함수를 import하는데, 실제 `bgmTracks.ts`에 해당 함수 존재 확인 완료 (line 17).
단, `BGM_TRACKS`가 `SONG_NAMES`를 `@services/songs`에서 import한다.

```bash
npm test apps/mobile/src/__tests__/data/bgmTracks.test.ts 2>&1 | grep "●"
```

FAIL 시 원인 후보:
- `@services/songs` 모듈 해석 오류 → `songs.ts` 경로 확인 + jest moduleNameMapper 확인
- `SONG_NAMES` 키 불일치 → 실제 `SONG_NAMES` 객체와 테스트 기대값 비교

### D-3-C: LegalScreen suite

**파일:** `apps/mobile/src/__tests__/LegalScreen.test.tsx`

`expo-web-browser`, `expo-constants` mock 사용. `LegalScreen` import 경로가 `../screens/LegalScreen`.
```bash
npm test apps/mobile/src/__tests__/LegalScreen.test.tsx 2>&1 | grep "●"
```

실제 `src/screens/LegalScreen.tsx` 파일 존재 확인 완료. FAIL 시 `expo-constants` default export 구조 확인.

### D-3-D: LyricsBox suite

**파일:** `apps/mobile/src/__tests__/components/LyricsBox.test.tsx`

`@testing-library/react-native` 사용. store mock 없음. `LYRICS`, `SONG_NAMES` 직접 import.
```bash
npm test apps/mobile/src/__tests__/components/LyricsBox.test.tsx 2>&1 | grep "●"
```

FAIL 시 원인: `LYRICS` 또는 `SONG_NAMES` 데이터 불일치 (brahms 등 키 누락).

### D-3-E: SocialAuthButtons suite

**파일:** `apps/mobile/src/__tests__/components/SocialAuthButtons.test.tsx`

`@testing-library/react-native` + `fireEvent.press`. store mock 없음. `Platform`, `Alert` spy 사용.
```bash
npm test apps/mobile/src/__tests__/components/SocialAuthButtons.test.tsx 2>&1 | grep "●"
```

FAIL 시 원인: `jest.replaceProperty(Platform, 'OS', ...)` — jest-expo에서 Platform mock 동작 확인.

### D-3-F: SongListItem suite

**파일:** `apps/mobile/src/__tests__/components/SongListItem.test.tsx`

`fireEvent.press(screen.getByLabelText('자장가 미리듣기'))` 패턴 — 이벤트 전파 분리 테스트.
카테고리 B (stopPropagation) fix 후 PASS 기대. 잔여 시:
```bash
npm test apps/mobile/src/__tests__/components/SongListItem.test.tsx 2>&1 | grep "●"
```

### D-3-G: CompletedTrackCard suite

**파일:** `apps/mobile/src/__tests__/components/CompletedTrackCard.test.tsx`

`react-test-renderer` + `cleanup`. `findAllByType('TouchableOpacity' as any)` 패턴.
Store mock 없음 (`@react-navigation/native`, `@hooks/useTheme`만 mock).
```bash
npm test apps/mobile/src/__tests__/components/CompletedTrackCard.test.tsx 2>&1 | grep "●"
```

### D-3-H: 스크린 suite (S04, S05, S07, S08, S09, S16)

각각 개별 실행하여 fail 패턴 확인 후 분류:
```bash
for f in S04SignupScreen S05LoginScreen S07SongSelectScreen S08RecordModeScreen S09RecordGuideScreen S16SettingsScreen; do
  echo "=== $f ==="
  npm test "apps/mobile/src/__tests__/screens/${f}.test.tsx" 2>&1 | grep "●" | head -5
done
```

**S07, S08**: `@store/authSlice __esModule: true` 이미 적용됨. PASS 기대.
**S09**: batch 3 (카테고리 C) fix 적용됨. PASS 기대.
**S04, S05**: `@hooks/useAuth`, `@services/auth-api` mock 사용. store mock 없어 A fix 영향 없음. PASS 기대.
**S16**: `@store __esModule: true` 적용됨. afterEach cleanup 적용됨. PASS 기대.

---

## D-4: 전수 재확인

D-1 ~ D-3 처리 후:
```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npm test 2>&1 | tail -20
# 기대: Test Suites: 0 failed
```

---

## PR #149 이어폰 모달 통합 절차

**PR 브랜치:** `feat/149-batch4-record-guide-pivot`
**대상 파일:** `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.*.test.tsx` (이어폰 모달 12 it)

**선행 조건:** `npm test` 0 failures 확인 후 진행.

**절차 (메인 Claude가 git 작업):**

```bash
# Step 1: main 최신 상태 확인
git checkout main && git pull

# Step 2: PR #149 브랜치 rebase
git checkout feat/149-batch4-record-guide-pivot
git rebase main

# Step 3: conflict 확인
# conflict 없으면 Step 4로
# conflict 있으면 engineer 호출 → 코드 conflict 해소 후 git rebase --continue

# Step 4: 테스트 실행
cd apps/mobile && npm test
# → PR #149 이어폰 모달 12 it GREEN 확인
# → 전체 0 failures 확인

# Step 5: push + PR merge
git push --force-with-lease origin feat/149-batch4-record-guide-pivot
```

**이어폰 모달 12 it 주요 내용 (PR #149 브랜치에만 존재):**
- 첫 진입 시 이어폰 경고 모달 1회 노출
- `@jajang:earphone_warning_dismissed` AsyncStorage 저장 후 재진입 미노출
- 모달 dismiss 핸들러 동작

**rebase conflict 가능성 분석:**
- S09RecordGuideScreen.tsx 또는 관련 hook이 Epic 09 batch 1~3에서 수정됐으면 conflict 가능
- S09RecordGuideScreen.test.tsx는 batch 3 (카테고리 C)에서 afterEach cleanup 추가됨 → conflict 높음
- engineer: 코드 conflict 해소만 담당 / git 조작은 메인 Claude

---

## 수정 파일 목록

| 파일 | 변경 내용 | 조건 |
|---|---|---|
| `apps/mobile/src/screens/RecordScreen.tsx` | `handleCancel` → async + `await stopBgm()` | D-1 (확정) |
| `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` | waitFor 래핑 추가 | D-2 triage 결과 필요 시 |
| D-3 triage 결과 파일들 | 개별 수정 (mock 보완, 데이터 불일치 등) | triage 후 결정 |
| PR #149 브랜치 내 파일 | rebase conflict 해소 | conflict 발생 시 |

---

## 의사코드 (수정 절차)

```
1. npm test 전체 실행 (batch 1~3 완료 후 잔여 확인)
   npm test 2>&1 | grep -E "FAIL|●" | head -60

2. D-1: RecordScreen.tsx handleCancel 수정 (확정)
   - handleCancel: () => void → async () => void
   - stopBgm() → await stopBgm()
   npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx
   → 3건 GREEN 확인

3. D-2: S01SplashScreen triage
   npm test apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx
   PASS면 skip / FAIL이면 fail 메시지 분석 후 최소 수정

4. D-3: 잔여 suites 개별 triage
   위 D-3-A ~ D-3-H 그룹별 npm test 실행
   FAIL인 것만 fail 메시지 기반 최소 수정

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
- BackHandler callback에서 `handleCancel()` 호출 — async 함수로 변경해도 BackHandler API 시그니처 호환. BackHandler는 return값을 사용하지 않음.
- `handleCancel`이 Alert 내부 `onPress` callback에서 재호출되는 패턴은 없음 — 안전.

**D-3 수정 시 핵심 원칙:**
- 기존 PASS 테스트 회귀 금지 — 파일별 수정 후 즉시 해당 파일 단독 실행 확인
- mock 패턴 변경 최소화 — 이미 `__esModule: true` 있는 파일에 중복 추가 금지
- `react-native` 수동 mock 파일은 jest-expo 전역 mock와 충돌하지 않는지 확인

**PR #149 rebase conflict 해소 기준:**
- S09RecordGuideScreen.test.tsx: main 버전 (afterEach cleanup 적용된 것) + PR #149의 이어폰 모달 12 it 병합
- 컴포넌트 파일 (RecordGuideScreen.tsx): main 버전 우선, PR #149의 이어폰 모달 렌더 로직 추가

---

## 결정 근거

**D-1 확정 수정 (RecordScreen.tsx):**
코드 실측 결과 `handleCancel`에서만 `await` 누락 확인. `handleStopPress`, `restartRecording`은 정상.
테스트 mock 설정 순서(applyBgmImpl)는 `beforeEach`에서 매번 호출 — 문제 없음.

**D-3 triage-first 전략:**
19개 suite 중 batch 1~3 fix 후 실제 FAIL 수는 불명확. 코드 패턴 분석으로 예상은 가능하나
실제 실행 전 수정 금지 원칙 준수. triage → 최소 수정 순서 유지.

**PR #149 옵션 (a) 유지:**
main 선 merge 후 자동 흡수 (옵션 b)는 PR #149 이어폰 모달 12 it 검증 없이 merge될 위험.
rebase로 Epic 09 fix + 이어폰 모달 통합 검증 후 merge.

---

## 수용 기준

- (TEST) `npm test apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` GREEN
- (TEST) `npm test apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` GREEN
- (TEST) `npm test` 전체 0 failures
- (TEST) PR #149 이어폰 모달 12 it 전체 GREEN (rebase 후 `npm test`)
- (MANUAL) `npm test -- --coverage` 0 exit code
- **회귀 보호:** `npm test 2>&1 | grep -E 'Tests:.*passed'` 수치 >= 484 (batch 1~3 완료 기준)
