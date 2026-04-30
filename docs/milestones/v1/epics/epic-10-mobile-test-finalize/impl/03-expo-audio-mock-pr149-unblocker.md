---
depth: std
---

# impl/03 — [Story 2 / #168] expo-audio named export mock + PR #149 mode-removal (S09 unblocker)

**Story:** #168 (Story 2 — F 6 main + 14 PR #149 추가 = 20 fails)
**선행 조건:** 없음 (병렬 가능 batch). 단 작업 위치는 PR #149 브랜치 (`feat/149-batch4-record-guide-pivot`).
**후행 조건:** S09RecordGuideScreen 0 failures (main + PR), impl/07 (이어폰 모달 unskip) 진입 가능

**context budget:** file edits ≤ 5 / tool uses ≤ 35

---

## 0. 시작 전 fail 분포 확인

```bash
# main 6 fails
cd /Users/dc.kim/project/jajang/apps/mobile
npx jest src/__tests__/screens/S09RecordGuideScreen.test.tsx 2>&1 | grep "●" | head -20

# PR #149 추가 14 fails (체크아웃 후)
git checkout feat/149-batch4-record-guide-pivot
npx jest 2>&1 | grep "●" | head -30
```

기대 패턴:
- F: `(0, _expoAudio.getRecordingPermissionsAsync) is not a function` (main 6, PR +6)
- PR #149 mode-removal: `mode 파라미터 없음` (S09 8, S07 1 = AC-04/AC-08, S10 1 shush 분기)

---

## 생성/수정 파일

- `apps/mobile/src/__tests__/_setup.ts` — `jest.mock('expo-audio', ...)` 추가 (공통 mock)
  - 또는 `apps/mobile/src/__tests__/__mocks__/expo-audio.ts` 신설 (둘 중 하나 — _setup.ts 우선)
- `apps/mobile/src/__tests__/screens/S09RecordGuideScreen.test.tsx` (PR 브랜치) — mode 파라미터 제거 it 정렬
- `apps/mobile/src/__tests__/screens/S07SongSelectScreen.test.tsx` (PR 브랜치) — AC-04/AC-08 mode 폐기 정렬
- `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` (PR 브랜치) — shush 분기 검증

---

## 인터페이스

### expo-audio mock factory (named exports 모두)

```ts
// _setup.ts 또는 __mocks__/expo-audio.ts
jest.mock('expo-audio', () => ({
  __esModule: true,
  // permissions
  getRecordingPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  // audio mode
  setAudioModeAsync: jest.fn(async () => undefined),
  // recorder
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
    uri: 'mock://recording.m4a',
    isRecording: false,
  })),
  // presets
  RecordingOptionsPresets: {
    HIGH_QUALITY: {},
    LOW_QUALITY: {},
  },
  // 추가 — 실측 후 보강 필요 시
}));
```

### PR #149 mode-removal 정렬 (S09)

PR #149 의 의도: `mode` 파라미터 제거 → `impl/13 단일 흐름` 으로 통일. test 도 `navigate('RecordGuide', { mode: 'humming' })` 같은 pattern 을 `navigate('RecordGuide')` 로 변경.

```ts
// before (PR 미정렬)
navigation.navigate('RecordGuide', { mode: 'humming' })

// after — single-flow
navigation.navigate('RecordGuide')
```

---

## 의사코드

```
1. PR #149 브랜치 체크아웃
   git checkout feat/149-batch4-record-guide-pivot

2. _setup.ts 에 jest.mock('expo-audio', ...) 추가
   - getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync,
     useAudioRecorder, RecordingOptionsPresets 모두 export

3. npx jest S09RecordGuideScreen.test.tsx
   → F 6 fails 자동 해소 확인

4. PR #149 mode-removal 14 fails:
   - S09: 8 fails — mode 파라미터 인자 제거
   - S07: 1 fail (AC-04/AC-08) — RecordMode 경유 제거
   - S10: 1 fail (shush) — mode 폐기 후 shush 분기 살아있는지 impl/13 검증

5. npx jest S09 S07 S10 → 0 failures

6. main 회귀 확인 (PR 브랜치에서):
   npx jest 2>&1 | grep -E "Tests:.*passed" → 502 + 14 (PR 가산) 이상
```

---

## 결정 근거

**왜 `_setup.ts` 우선 (vs `__mocks__/expo-audio.ts`)?**
`__mocks__/` 디렉터리는 jest 가 자동 인식하지만, monorepo + jest-expo preset 환경에서 path resolution 위험 (epic-08 에서 jest-expo preset 충돌 경험). `_setup.ts` 의 명시적 `jest.mock(...)` 가 가장 안전 + grep 가능.

**왜 named export 전부 jest.fn?**
`useAudioRecorder` 가 hook 형태 — 실제 컴포넌트가 destructure 하는 모든 method (`prepareToRecordAsync`, `record`, `stop`) 를 누락 시 cascade fail. 한 번에 풀 export.

**왜 PR #149 브랜치에서 작업?**
mode-removal 14 fails 는 PR #149 자체 변경. main 에 push 시 PR 의 의도 깨짐. PR 브랜치에 commit 한다 (메인 Claude 의 git 책임).

---

## 다른 모듈과의 경계

- `_setup.ts` 는 모든 jest 파일 공통 영향 — 회귀 위험. 추가 mock 만 하고 기존 mock 수정 금지.
- impl/06 (분산 fix): D-3 (S10 shush) 와 일부 겹침 — 본 batch 가 shush 분기 검증 우선, impl/06 가 잔여 stopBgm 호출 spy fix
- impl/07 (이어폰 모달 unskip): expo-audio mock 도입 후에만 의미 — 후속 batch
- impl/08 (rebase merge): 본 batch 의 PR 브랜치 commit 이 rebase 대상

---

## 수용 기준

- (TEST) main: `npx jest src/__tests__/screens/S09RecordGuideScreen.test.tsx` 0 failures
- (TEST) PR #149: `npx jest S09 S07 S10` 0 failures
- (TEST) `npx jest 2>&1 | grep "is not a function" | grep expoAudio` 0건
- 회귀 보호: PR #149 의 16 skipped 유지 (impl/07 가 14 unskip 별도 처리)

---

## MODULE_PLAN_READY
