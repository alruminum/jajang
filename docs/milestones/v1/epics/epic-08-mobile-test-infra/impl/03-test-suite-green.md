---
depth: std
---
# impl-03 — 기존 테스트 파일 jest 호환 변환 + testPathIgnorePatterns 단순화 + 잔여 fail triage

**이슈**: #153  
**에픽**: epic-08-mobile-test-infra  
**선행 impl**: 02-setup-mock-jest-migration.md (완료 필수)  
**후행 impl**: 없음 (마지막 impl)

---

## 결정 근거

### 실측 현황 (batch 3 시작 시점)

실측 grep 결과 (2026-04-30):

- `vi.*` 잔류 파일: **31개** (TimerBottomSheet.test.tsx 포함 — vitest import 없이 전역 vi.* 사용)
- `from 'vitest'` import 잔류: **30개** (recording-store, player-store, theme/tokens, theme/typography, data/bgmTracks, data/lyrics, components/LyricsBox 포함)
- `vi.importActual` 사용: **0건** — `jest.requireActual` 변환 불필요
- `vi.mocked()` 사용: SettingsScreen, S16SettingsScreen, AccountDeletionScreen, useEntitlement, useTheme, services/revenue-cat, services/revenue-cat-management-url, services/tracks-api, services/songs-api 등 다수

### testPathIgnorePatterns 현황

현재 `jest.config.js` line 73의 패턴:
```
'/src/__tests__/(?!(_smoke|audio/AudioEngine-timer|useBgmPlayer|screens/S01SplashScreen|screens/S10RecordScreen\\.bgm)\\.test\\.(ts|tsx))',
```
batch 1/2 임시 화이트리스트. 5개 파일만 실행 허용. batch 3 완료 후 제거 → `_setup.ts` 제외만 유지.

### 잔여 fail triage (4건)

**S10RecordScreen.bgm 3건 (stopBgm 미호출)**:
- `S10RecordScreen.bgm.test.tsx` 는 이미 전체 jest.* 사용 (vi.* 없음). 화이트리스트에 포함되어 실행 중.
- 테스트는 `useBgmPlayer` 를 완전 mock하여 `stopBgmMock` 를 주입. mock 내부에 setInterval 없으므로 fake timer 이슈 아님.
- 실패 원인: `RecordScreen` 의 stop/cancel/restart 핸들러가 `await stopBgm()` 를 호출하지 않거나 조건부로 스킵. engineer가 `RecordScreen.tsx` 해당 핸들러 로직을 확인해야 함.
- **처리**: vi.* 변환과 무관. RecordScreen 구현 버그. 이 impl 완료 후 engineer가 별도 triage.

**S01SplashScreen 1건 (async 타이밍)**:
- `S01SplashScreen.test.tsx` 도 이미 전체 jest.* 사용. 화이트리스트에 포함.
- `advanceSplash()` 헬퍼가 `Promise.resolve()` 5회 flush → async 체인이 충분히 소진되지 않을 수 있음.
- **처리**: vi.* 변환과 무관. engineer가 `advanceSplash` Promise flush 횟수 추가 또는 `waitFor` 추가.

두 fail 모두 vi.* → jest.* 변환 범위 외. engineer가 개별 triage.

### react-test-renderer 19 deprecation 경고 정책

React 19.2에서 `react-test-renderer` 19가 deprecated 경고 출력. `@testing-library/react-native` 가 내부 사용. 테스트 동작에 영향 없음. **무시 정책** — 별도 suppression 불필요.

### PR #149 이어폰 모달 테스트

`grep -rl "AudioOutput\|HeadphoneModal\|이어폰" apps/mobile/src/__tests__/` 결과 0건 (미 merge). batch 3 완료 후 PR #149 merge 시 해당 파일도 동일 sed 적용 필요.

---

## 수정 파일 목록

| 파일 | 작업 | 설명 |
|---|---|---|
| `apps/mobile/src/__tests__/**/*.test.ts(x)` (31개) | vi.* → jest.* 변환 + vitest import 제거 | 아래 sed 레시피 |
| `apps/mobile/jest.config.js` | testPathIgnorePatterns 단순화 | 화이트리스트 제거 |

CLAUDE.md 는 이미 `npm test` 로 갱신 완료 — 수정 불필요.

---

## 변환 상세

### 1. 전체 파일 sed 변환 (순서 중요)

```bash
cd /Users/dc.kim/project/jajang/apps/mobile

# 대상 파일 목록 취득
VI_FILES=$(grep -rl "vi\." src/__tests__/ --include="*.ts" --include="*.tsx")
VITEST_FILES=$(grep -rl "from 'vitest'" src/__tests__/ --include="*.ts" --include="*.tsx")

# --- Step 1: vi.mock / vi.fn() / vi.spyOn / timer / mock 유틸 ---
for f in $VI_FILES; do
  sed -i '' \
    -e 's/\bvi\.mock(/jest.mock(/g' \
    -e 's/\bvi\.spyOn(/jest.spyOn(/g' \
    -e 's/\bvi\.mocked(/jest.mocked(/g' \
    -e 's/\bvi\.fn()/jest.fn()/g' \
    -e 's/\bvi\.clearAllMocks()/jest.clearAllMocks()/g' \
    -e 's/\bvi\.resetAllMocks()/jest.resetAllMocks()/g' \
    -e 's/\bvi\.restoreAllMocks()/jest.restoreAllMocks()/g' \
    -e 's/\bvi\.useFakeTimers()/jest.useFakeTimers()/g' \
    -e 's/\bvi\.useRealTimers()/jest.useRealTimers()/g' \
    "$f"
done

# --- Step 2: ReturnType<typeof vi.fn> → jest.Mock (타입 어노테이션) ---
# vi.fn 뒤에 ()가 없는 패턴 — Step 1 이후 처리
for f in $VI_FILES; do
  sed -i '' 's/ReturnType<typeof vi\.fn>/jest.Mock/g' "$f"
done

# --- Step 3: 나머지 vi.fn 잔류 (typeof vi.fn 등 edge case) ---
for f in $VI_FILES; do
  sed -i '' 's/\bvi\.fn\b/jest.fn/g' "$f"
done

# --- Step 4: vitest import 제거 ---
# "import { ... } from 'vitest'" 한 줄 전체 제거
for f in $VITEST_FILES; do
  sed -i '' "/from 'vitest'/d" "$f"
done
```

**Step 순서 근거**:
- Step 1: `vi.fn()` (괄호 포함) 먼저 처리
- Step 2: `ReturnType<typeof vi.fn>` (괄호 없음) 처리 — Step 1 후 잔류
- Step 3: `vi.fn` 단독 edge case 처리
- Step 4: vitest import 제거 — vi.* 참조가 모두 제거된 후 실행

역순 시 Step 3가 `vi.fn()` 내부의 `vi.fn` 을 먼저 치환해 이중 변환 발생.

**false positive 방지**: `\bvi\.` word boundary 가 `device`, `service`, `previous`, `via` 등 단어 내 `vi` 를 제외. macOS(BSD) sed는 `\b` 지원 확인 완료.

**`from 'vitest'` import 제거 근거**: jest-expo preset이 `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `jest` 를 전역 주입. `vi` 전역은 존재하지 않으므로 import 제거 전 Step 1~3 완료 필수.

### 2. useTheme.test.ts 자동 변환 결과 확인

line 35 패턴:
```typescript
// 변환 전
mockUseThemeStore.mockImplementation((selector: (s: { pref: ThemePref; setPref: ReturnType<typeof vi.fn> }) => unknown) =>
  selector({ pref, setPref: vi.fn() })
);

// 변환 후 (Step 1 + Step 2 적용)
mockUseThemeStore.mockImplementation((selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
  selector({ pref, setPref: jest.fn() })
);
```

자동 변환으로 처리 가능. 변환 후 `npx tsc --noEmit` 으로 타입 오류 없음 확인.

### 3. testPathIgnorePatterns 단순화

`apps/mobile/jest.config.js` 의 `testPathIgnorePatterns` 를 아래로 교체:

```js
// 변경 전
testPathIgnorePatterns: [
  '/node_modules/',
  '/src/__tests__/_setup\\.ts$',
  '/src/__tests__/(?!(_smoke|audio/AudioEngine-timer|useBgmPlayer|screens/S01SplashScreen|screens/S10RecordScreen\\.bgm)\\.test\\.(ts|tsx))',
],

// 변경 후
testPathIgnorePatterns: [
  '/node_modules/',
  '/src/__tests__/_setup\\.ts$',
],
```

line 73 화이트리스트 패턴 완전 제거. 모든 `*.test.ts(x)` 파일이 실행 대상이 됨.

### 4. 전체 suite 실행 및 잔여 fail 확인

```bash
cd /Users/dc.kim/project/jajang/apps/mobile
npm test 2>&1 | tee /tmp/jest-e08b3-results.txt
```

예상 결과:
- vi.* 변환 완료 파일 전체: PASS
- S10 3건 + S01 1건: FAIL (RecordScreen 구현 버그, 이 impl 범위 외)
- 나머지 모든 suite: PASS

### 5. 변환 검증

```bash
cd /Users/dc.kim/project/jajang/apps/mobile

# vi.* 잔류 0건 확인
grep -rn "\bvi\." src/__tests__/ --include="*.ts" --include="*.tsx"

# vitest import 잔류 0건 확인
grep -rn "from 'vitest'" src/__tests__/ --include="*.ts" --include="*.tsx"

# 타입 오류 없음 확인
npx tsc --project tsconfig.json --noEmit
```

---

## 구현 레시피 (순서)

1. Step 1~4 sed 순서대로 실행 (`VI_FILES` / `VITEST_FILES` 변수로 31개 파일 일괄 처리)
2. `grep -rn "\bvi\." src/__tests__/` → 0건 확인 (false positive 육안 검토)
3. `grep -rn "from 'vitest'" src/__tests__/` → 0건 확인
4. `jest.config.js` `testPathIgnorePatterns` line 73 제거
5. `npm test` 전체 실행 → S10 3건 + S01 1건 외 모든 suite PASS 확인
6. `npx tsc --project tsconfig.json --noEmit` → 타입 오류 0건

---

## 수용 기준

- (MANUAL) `grep -rn "\bvi\." apps/mobile/src/__tests__/` 결과 0건 (false positive 제외)
- (MANUAL) `grep -rn "from 'vitest'" apps/mobile/src/__tests__/` 결과 0건
- (TEST) `npm test` 실행 시 S10 3건 + S01 1건 외 모든 suite PASS
- (MANUAL) `jest.config.js` `testPathIgnorePatterns` 에 화이트리스트 패턴 없음 — `_setup.ts` 제외만 존재
- (MANUAL) `npx tsc --project tsconfig.json --noEmit` 타입 오류 0건

---

## 주의사항

- **sed Step 순서 필수**: 역순 실행 시 `vi.fn()` → `vi.jest.fn()` 같은 이중 변환 발생.
- **`\bvi\.` word boundary**: macOS BSD sed 지원 확인. `device`, `service`, `via`, `previous` 등 오검출 방지.
- **TimerBottomSheet.test.tsx**: `from 'vitest'` import 없이 `vi.mock` / `vi.fn` 전역 사용. `$VI_FILES` 에 포함되어 Step 1~3 적용됨. `$VITEST_FILES` 에 미포함 — Step 4 불필요 (정상).
- **react-test-renderer deprecation 경고**: React 19.2 환경 노이즈. 테스트 통과/실패에 영향 없음 — 무시.
- **PR #149**: 이어폰 모달 테스트 파일 미 merge. batch 3 완료 후 PR #149 merge 시 해당 파일도 동일 sed 적용.
- **S10 / S01 fail**: RecordScreen 구현 버그 및 async flush 이슈. vi.* 변환 범위 외 — engineer triage.
