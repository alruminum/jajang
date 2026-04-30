# Epic 10 — Mobile Test Triage Finalize + PR #149 Merge

**목표:** Epic 09 완료 후 잔여 94 fails / 14 fail suites 카테고리별 정리 + PR #149 (S09/S10 mode 폐기 + 이어폰 모달) GREEN merge.
**선행 조건:** Epic 09 batch 1~4 완료 (main: 502 PASS / 94 fail / 2 skip / 598 total — 31 PASS suites / 14 FAIL suites).
**완료 기준:** `npm test` mobile 전체 0 failures (의도 skip 제외) + PR #149 merge.

**GitHub Epic Issue:** [#166](https://github.com/alruminum/jajang/issues/166)

---

## 실측 fail 분포 (main, 2026-04-30)

`npx jest --silent --json` 결과 카테고리화:

| 카테고리 | 패턴 | 발생 suites | fails 수 |
|---|---|---|---|
| **A: ELEMENT_INVALID** | `Element type is invalid: expected a string ... but got: object` | S04SignupScreen(14), S05LoginScreen(13), S06HomeScreen(6) | 33 |
| **B: TO_CONTAIN (text query)** | `Error: expect(received).toContain(expected) // indexOf` (snapshot/text find) | CompletedTrackCard(9), S06HomeScreen(1) | 10 |
| **C: UNMOUNTED_ROOT** | `Can't access .root on unmounted test renderer` | CompletedTrackCard(6), S06HomeScreen(3) | 9 |
| **D: TO_HAVE_BEEN_CALLED (logic)** | `Expected number of calls: >= 1` (mock spy 미호출) | S08RecordModeScreen(2), S10RecordScreen.bgm(3), S16SettingsScreen(2), AccountDeletionScreen(1), S09RecordGuideScreen(2), SocialAuthButtons(2) | 12 |
| **E: TO_CONTAIN data** | bgmTracks 라이브러리 deep-equality | bgmTracks.test.ts(7) | 7 |
| **F: EXPO_AUDIO_FN** | `(0, _expoAudio.getRecordingPermissionsAsync) is not a function` | S09RecordGuideScreen(6) | 6 |
| **G: SocialAuthButtons.CANCELED** | `Cannot read properties of undefined (reading 'CANCELED')` (`@react-native-google-signin/google-signin` mock 미흡) | SocialAuthButtons(5) | 5 |
| **H: A11Y matcher** | `toHaveAccessibilityState is not a function` / multiple `selected: false` | SongListItem(1), S07SongSelectScreen(2) | 3 |
| **I: 기타** | LegalScreen 버전 텍스트 1 / S16Settings 5 / S08 1 / S09 1 / S06 1 (Story 1) | 분산 | 9 |
| **합계** | | 14 suites | **94** |

> **PR #149 추가 fails (14):** main 보다 +14 — 모두 S09 mode-removal 관련 (`mode 파라미터 없음` 등) + 카테고리 F 확장. 즉 카테고리 F 의 expo-audio mock fix 가 PR 의 핵심 unblocker.

---

## Story 1 — 카테고리 A + S06HomeScreen 전체 (38 fails)

**As a** 개발자
**I want** S04/S05/S06 의 사용자 컴포넌트 mock + S06 의 텍스트 query / async cleanup / 분산 fail 이 일괄 처리되길 원한다
**So that** `Element type is invalid ... got: object` 33 fails 와 S06HomeScreen 의 5 잔여 fails (B 1 + C 3 + I 1) 가 모두 사라진다

### 근본 원인

- **A (33)**: 테스트가 `jest.mock('@components/SocialAuthButtons', () => ({ SocialAuthButtons: <jsx/> }))` 처럼 **JSX 객체** 를 export 했거나 default vs named 혼동으로 컴포넌트가 객체로 평가됨. RN 17+ Fabric renderer 는 이 경우 `Element type is invalid: ... got: object` 로 즉시 throw.
- **S06 잔여 5**: A 6 fix 후에도 같은 suite 안에 남는 (B 1 text query, C 3 unmounted root, I 1 분산) — 같은 파일 내 review 통합이 효율적.

### 영향 파일

- `src/__tests__/screens/S04SignupScreen.test.tsx` — 14 fails (전체, 카테고리 A)
- `src/__tests__/screens/S05LoginScreen.test.tsx` — 13 fails (전체, 카테고리 A)
- `src/__tests__/screens/S06HomeScreen.test.tsx` — **11 fails 전체** (A 6 + B 1 + C 3 + I 1)

### 태스크 체크리스트

- [x] S04 — mock 으로 import 되는 모든 컴포넌트 식별 (`grep -E "jest\.mock\(.*components" src/__tests__/screens/S04SignupScreen.test.tsx`) 후 함수형 mock 으로 통일
  - 패턴: `jest.mock('@components/X', () => ({ __esModule: true, default: () => null, X: () => null }))`
- [x] S05 동일 적용
- [x] S06 카테고리 A 6 fails — 동일 mock 패턴 적용
- [x] S06 카테고리 B 1 fail — text query regex 또는 `findByText` 비동기 변환
- [x] S06 카테고리 C 3 fails — 명시적 `unmount()` + `await waitFor` 보강
- [x] S06 카테고리 I 1 fail — fail 메시지 캡처 후 individual fix
- [x] 각 파일별 `npx jest <파일>` GREEN 확인

### 수용 기준

- (TEST) `npx jest src/__tests__/screens/S04SignupScreen.test.tsx` 0 failures
- (TEST) `npx jest src/__tests__/screens/S05LoginScreen.test.tsx` 0 failures
- (TEST) `npx jest src/__tests__/screens/S06HomeScreen.test.tsx` 0 failures (11 fails 전체 fix)
- 회귀 보호: 502 PASS 유지

---

## Story 2 — 카테고리 F + PR #149 expo-audio mock 정정 + S09 mode-removal 잔여 (PR #149 unblocker)

**As a** 개발자
**I want** `expo-audio` 의 `getRecordingPermissionsAsync` / `requestRecordingPermissionsAsync` 가 jest 환경에서 함수로 mock 되길 원한다
**So that** S09RecordGuideScreen 의 6 fails (main) + PR #149 의 14 추가 fails 가 일괄 fix 된다

### 근본 원인

`(0, _expoAudio.getRecordingPermissionsAsync) is not a function` — jest mock factory 가 `getRecordingPermissionsAsync` 를 export 하지 않거나 default 만 존재. RecordGuideScreen 이 named import 사용.

### 영향 파일

- `src/__tests__/screens/S09RecordGuideScreen.test.tsx` (main 6 fails + PR 추가 8 fails)
- PR #149 brand new it: mode 파라미터 없음 / impl/13 단일 흐름 검증 (PR-only 14 fails)
- 가능 파일: `src/__tests__/_setup.ts` 또는 `__mocks__/expo-audio.ts` (공통 mock)

### 태스크 체크리스트

- [ ] PR #149 브랜치 (`feat/149-batch4-record-guide-pivot`) 체크아웃 후 작업
- [ ] 공통 mock 위치 결정: `src/__tests__/_setup.ts` 에 `jest.mock('expo-audio', ...)` 추가 또는 `__mocks__/expo-audio.ts` 신설
- [ ] mock factory 에 `getRecordingPermissionsAsync`, `requestRecordingPermissionsAsync`, `setAudioModeAsync`, `RecordingOptionsPresets`, `useAudioRecorder` 등 named exports 모두 jest.fn() 으로 export
- [ ] S09 main 의 6 fails GREEN
- [ ] PR #149 의 S09 mode-removal 8 fails (`mode 파라미터 없음`, `impl/13`) GREEN
- [ ] PR #149 의 S07 mode-removal 1 fail (`AC-04/AC-08: RecordMode 경유 제거`) GREEN
- [ ] PR #149 의 S10 1 fail (`shush 모드`) — mode 폐기 후에도 shush 분기는 살아있는지 확인 필요. impl/13 검토.
- [ ] PR 브랜치 `npx jest src/__tests__/screens/S09*.tsx S07*.tsx S10*.tsx` 0 failures

### 수용 기준

- (TEST) main: `npx jest S09RecordGuideScreen` 0 failures
- (TEST) PR #149: 동일 0 failures
- 회귀 보호: PR #149 의 16 skipped 유지 또는 더 줄어들기 (Story 5 가 14 unskip)

---

## Story 3 — 카테고리 C + B + I: CompletedTrackCard async teardown + text query (15 fails)

**As a** 개발자
**I want** CompletedTrackCard 가 async cleanup 후에도 `Can't access .root on unmounted` 없이 통과하길 원한다

### 근본 원인

- C: 컴포넌트 언마운트 후 useEffect 비동기 setState 가 root 접근 — `unmount()` 명시 + `await waitFor` 누락
- B: `getByText("브람스 자장가")` 등 텍스트 단편 매칭 — RN18 화이트스페이스 변환 / 다중 텍스트 노드 분할로 fail. `getByText(/브람스/)` regex 또는 `findByText` async 변환 필요

### 영향 파일

- `src/__tests__/components/CompletedTrackCard.test.tsx` — C 6 + B 9 = 15 fails (suite 전체)

### 태스크 체크리스트

- [x] 각 it 마다 명시적 `unmount()` + `afterEach(cleanup)` 추가
- [x] text query 패턴 변환: literal → regex 또는 `findByText` 비동기
- [x] fake timer 사용 시 `jest.useRealTimers` 보강
- [x] 파일 GREEN 확인

### 수용 기준

- (TEST) `npx jest CompletedTrackCard` 0 failures
- 회귀 보호: 502 PASS 유지

---

## Story 4 — 카테고리 D + E + G + H + I (S06 제외): logic / bgmTracks / SocialAuthButtons / A11Y / 기타 (29 fails)

**As a** 개발자
**I want** 실제 로직 mock spy 미호출 / google-signin mock 누락 / 기타 분산 fails 가 fix 되길 원한다

### 영향 fails 분해

- **D-1: SocialAuthButtons (5 CANCELED + 2 toHaveBeenCalled = 7)** — `@react-native-google-signin/google-signin` mock 에 `statusCodes.CANCELED` 누락. mock factory 보강.
- **D-2: S08RecordModeScreen (2 + 1 OTHER = 3)** — main 에 S08 자체가 살아있는지 확인 (PR #149 가 S08 폐기). mode 폐기 시 아예 .skip 또는 삭제.
- **D-3: S10RecordScreen.bgm (3)** — Story 2 와 일부 겹침. shush 모드 BGM 분기 검증.
- **D-4: S16SettingsScreen (2 + 5 OTHER = 7)** — 설정 화면 mock spy 호출 검증 + 텍스트 매칭.
- **D-5: AccountDeletionScreen (1)**.
- **D-6: S09RecordGuideScreen (2)** — Story 2 의 잔여 toHaveBeenCalled.
- **D-7: bgmTracks.test.ts (7 deep equality)** — 라이브러리 데이터 변경 (v1.3.1 DSP 피벗 영향?) 확인 후 expectation 갱신.
- **D-8: A11Y 3 (SongListItem, S07)** — `toHaveAccessibilityState` matcher 가 `@testing-library/jest-native` 미로드. setup 에서 `import '@testing-library/jest-native/extend-expect'` 또는 v12 의 `accessibilityState` prop 직접 검증으로 마이그레이션.
- **D-9: LegalScreen (1)** — `버전 1.2.3` 텍스트 — 실제 app version 과 expectation 불일치. `package.json` version 동적 import.

### 태스크 체크리스트

- [ ] D-1 google-signin mock 정정 (`__mocks__/@react-native-google-signin/google-signin.ts`)
- [ ] D-2 S08 처리 결정 (skip/삭제) — PR #149 와 정렬
- [ ] D-3~D-6 개별 triage + fix
- [ ] D-7 bgmTracks expectation 갱신 (DSP 피벗 후 데이터 확인)
- [ ] D-8 A11Y matcher 도입 또는 v12 prop 검증으로 변환
- [ ] D-9 LegalScreen 버전 동적화 (또는 expect.stringMatching)
- [ ] 모든 D fail suites GREEN

### 수용 기준

- (TEST) `npx jest` 카테고리 D/G/I 영향 fails 0
- 회귀 보호: 502 PASS 유지

---

## Story 5 — PR #149 이어폰 모달 14 it skip → assertion 수정 + GREEN

**As a** 개발자
**I want** PR #149 의 5 describe `.skip` 상태 14 it (이어폰 모달) 가 정상 통과하길 원한다
**So that** PR #149 의 의도 skip 이 의도 PASS 로 전환되며 카테고리 H 의 `getByText` 다중 매칭 / scope 좁힘 실패가 해결된다

### 근본 원인 (호출자 컨텍스트 명시)

- query 패턴 정정: `getByText(...)` → `getAllByText(...)[0]` 또는 `within(modalContainer).getByText(...)` 로 scope 좁히기
- 모달이 두 번 렌더링되거나 (예: 마이크 모달 + 이어폰 모달 동시) 헤더/본문 양쪽 텍스트 중복

### 영향 파일

- PR #149 브랜치의 `src/__tests__/screens/S09RecordGuideScreen.test.tsx` 내 5 describe `.skip` (14 it)

### 태스크 체크리스트

- [ ] 각 describe `.skip` → 일반 describe 로 복원
- [ ] 첫 실행 fail 메시지 캡처 후 query 패턴 확인
- [ ] `within(getByTestId('earphone-modal'))` 등 scope 좁힘 도입
- [ ] 다중 매칭 시 `getAllByText` + index 사용
- [ ] AsyncStorage `@jajang:earphone_warning_dismissed` mock 시나리오 검증
- [ ] 14 it 전체 GREEN

### 수용 기준

- (TEST) PR #149 브랜치에서 `npx jest S09RecordGuideScreen` skipped: 16 → 2 (기존 의도 skip만)
- (TEST) 14 it 모두 PASS

---

## Story 6 — PR #149 GREEN 검증 + merge

**As a** 개발자
**I want** PR #149 가 main 의 Story 1~4 흡수 + 자체 Story 5 fix 후 0 failures 상태에서 merge 되길 원한다

### 절차

1. main 에서 Story 1~4 PR 들 순차 merge (또는 단일 PR 묶음)
2. PR #149 브랜치 `git rebase main`
3. Story 2 (PR #149 unblocker) 가 PR 안에 또는 main 에 포함된 상태 확인
4. Story 5 (이어폰 모달 unskip) 적용
5. `npx jest` 0 failures (의도 skip 2 만 잔존)
6. PR #149 merge (`gh pr merge 149 --squash`)

### 태스크 체크리스트

- [ ] Story 1~5 모두 main / PR 에 적용 완료
- [ ] PR #149 rebase + push
- [ ] PR #149 CI GREEN
- [ ] `npx jest` 0 failures 확인
- [ ] `gh pr merge 149 --squash`
- [ ] backlog.md / CLAUDE.md Epic 10 완료 체크

### 수용 기준

- (TEST) PR #149 mergeable + CI GREEN
- (TEST) merge 후 main: `npx jest` 0 failures (598 - 의도 skip)
- (DOC) backlog.md Epic 10 완료 체크

---

## 의존성 (실행 순서)

```
Story 1 (카테고리 A — S04/S05/S06 component mock) ─┐
Story 2 (PR #149 unblocker — expo-audio + S09 mode) ─┼─ 병렬 가능 (서로 다른 파일)
Story 3 (CompletedTrackCard async + text)         ─┤
Story 4 (D/G/I 분산 fix)                          ─┘
                          ↓
Story 5 (PR #149 이어폰 모달 14 it unskip)
                          ↓
Story 6 (PR #149 GREEN + merge)
```

> Story 1~4 는 서로 다른 파일군이라 병렬 가능. Story 2 만 PR #149 브랜치에서 작업.
> Story 5 는 Story 2 의 expo-audio mock fix 가 적용된 상태에서만 의미 있음.
> Story 6 는 1~5 모두 완료 후.

---

## 관련 이슈

| 스토리 | GitHub Issue |
|---|---|
| Epic | [#166](https://github.com/alruminum/jajang/issues/166) |
| Story 1 | [#167](https://github.com/alruminum/jajang/issues/167) |
| Story 2 | [#168](https://github.com/alruminum/jajang/issues/168) |
| Story 3 | [#169](https://github.com/alruminum/jajang/issues/169) |
| Story 4 | [#170](https://github.com/alruminum/jajang/issues/170) |
| Story 5 | [#171](https://github.com/alruminum/jajang/issues/171) |
| Story 6 | [#172](https://github.com/alruminum/jajang/issues/172) |

---

## Batch Index

`/impl-loop` 입력 단위 batch 분해. 상세는 [`batch-list.md`](./batch-list.md) 참조.

| Batch | impl 파일 | Story | 예상 fails |
|---|---|---|---|
| 01 | [01-s04-s05-component-mock.md](./impl/01-s04-s05-component-mock.md) | 1a | 27 |
| 02 | [02-s06-home-screen-mixed-fix.md](./impl/02-s06-home-screen-mixed-fix.md) | 1b | 11 |
| 03 | [03-expo-audio-mock-pr149-unblocker.md](./impl/03-expo-audio-mock-pr149-unblocker.md) | 2 | 20 |
| 04 | [04-completed-track-card-async-text.md](./impl/04-completed-track-card-async-text.md) | 3 | 15 |
| 05 | [05-google-signin-a11y-infra.md](./impl/05-google-signin-a11y-infra.md) | 4a | 10 |
| 06 | [06-distributed-logic-fixes.md](./impl/06-distributed-logic-fixes.md) | 4b | ~22 |
| 07 | [07-pr149-earphone-modal-unskip.md](./impl/07-pr149-earphone-modal-unskip.md) | 5 | 14 |
| 08 | [08-pr149-rebase-merge.md](./impl/08-pr149-rebase-merge.md) | 6 | 0 (verify) |

**의존성**: 01/02/03/04/05 병렬 → 06 (← 05) / 07 (← 03) → 08 (← 1~7)
