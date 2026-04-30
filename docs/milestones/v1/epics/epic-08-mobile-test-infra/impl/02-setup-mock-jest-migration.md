---
depth: std
---
# impl-02 — Setup 파일 & __mocks__ jest 변환 (vi.* → jest.*)

**이슈**: #152  
**에픽**: epic-08-mobile-test-infra  
**선행 impl**: 01-jest-infra.md (완료 필수 — jest.config.js 없으면 실행 불가)  
**후행 impl**: 03-test-suite-green.md

---

## 결정 근거

### advanceTimersByTimeAsync 변환 — 패턴 A만 사용

`vi.advanceTimersByTimeAsync(N)` → jest 동등 API 없음. 두 가지 패턴 검토:

| 패턴 | 코드 | 위험 |
|---|---|---|
| A (인라인 flush) | `jest.advanceTimersByTime(N); await Promise.resolve();` | 없음 |
| B (flushPromises) | `const flushPromises = () => new Promise(setImmediate)` | `useFakeTimers` 환경에서 setImmediate가 fake 처리되어 hang |

대상 4파일 모두 `useFakeTimers` 사용 → 패턴 A만 사용. 패턴 B 금지.

### jest-expo auto-mock 중복 정리 판단 근거

jest-expo가 자동 mock 제공하는 모듈: `expo-asset`, `expo-constants`, `expo-modules-core`, `expo-font`, `expo-localization`.  
`expo-secure-store`, `expo-audio`는 jest-expo auto-mock 미포함 → setup.ts 수동 mock 유지.  
RN 외부 라이브러리(`react-native-safe-area-context` 등)는 jest-expo 무관 → setup.ts 유지.

### vi.* 일괄 변환 전략

`setup.ts` 전면 재작성. `advanceTimersByTimeAsync`는 sed 불가(멀티라인 대체 필요) → 4파일 수동 처리.  
나머지 `vi.mock` / `vi.fn()` / `vi.spyOn()` / `from 'vitest'` import는 `sed` 일괄 처리.

---

## 수정 파일 목록

| 파일 | 작업 | 설명 |
|---|---|---|
| `apps/mobile/src/__tests__/setup.ts` | 전면 재작성 | vi.* → jest.* 전환 |
| `apps/mobile/src/__tests__/audio/AudioEngine-timer.test.ts` | 수정 | advanceTimersByTimeAsync + vi.* → jest.* |
| `apps/mobile/src/__tests__/screens/S01SplashScreen.test.tsx` | 수정 | advanceTimersByTimeAsync + vi.* → jest.* |
| `apps/mobile/src/__tests__/screens/S10RecordScreen.bgm.test.tsx` | 수정 | vi.* import 제거 + advanceTimersByTimeAsync 변환 |
| `apps/mobile/src/__tests__/useBgmPlayer.test.ts` | 수정 | vi.* import 제거 + advanceTimersByTimeAsync 변환 |
| `apps/mobile/src/__mocks__/react-native-track-player.js` | 검토 후 유지 | ES module export → jest-expo 환경 호환 확인 |
| `apps/mobile/src/__mocks__/react-native-google-mobile-ads.js` | 검토 후 유지 | 동일 |
| `apps/mobile/stubs/react-native-purchases.js` | 검토 후 유지 | 동일 |

---

## 변환 상세

### 1. setup.ts 전면 재작성

`import { vi } from 'vitest'` 제거. `vi.mock(...)` → `jest.mock(...)`. `vi.fn()` → `jest.fn()`.

아래가 재작성된 전체 내용:

```typescript
// ─── React Native globals ────────────────────────────────────────────────────
(global as unknown as Record<string, unknown>).__DEV__ = false;

// ─── react-native ────────────────────────────────────────────────────────────
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (obj: Record<string, unknown>) => obj['ios'] ?? obj['default'],
  },
  Alert: { alert: jest.fn() },
  StyleSheet: {
    create: (s: Record<string, unknown>) => s,
    flatten: (s: unknown) => s,
    hairlineWidth: 1,
    absoluteFill: {},
  },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'ActivityIndicator',
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Linking: {
    openURL: jest.fn().mockResolvedValue(undefined),
    openSettings: jest.fn().mockResolvedValue(undefined),
  },
}));

// ─── react-native-safe-area-context ──────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ─── expo-secure-store ───────────────────────────────────────────────────────
// jest-expo auto-mock 미포함 → 수동 mock 유지
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ─── Apple Authentication ─────────────────────────────────────────────────────
jest.mock('@invertase/react-native-apple-authentication', () => ({
  default: {
    performRequest: jest.fn(),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
    Error: { CANCELED: 'CANCELED' },
  },
}));

// ─── Google Sign-In ──────────────────────────────────────────────────────────
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 12501 },
}));

// ─── React Navigation ────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    replace: jest.fn(),
  })),
  useRoute: jest.fn(() => ({ params: {} })),
}));

// ─── @react-navigation/native-stack ──────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: jest.fn(),
}));

// ─── react-native-track-player ───────────────────────────────────────────────
// __mocks__/react-native-track-player.js가 moduleNameMapper로 이미 매핑되므로
// jest.mock() 선언 없이도 해당 stub 파일이 로드됨.
// 단, setup.ts에서 추가 mock이 필요한 경우에만 jest.mock() 사용.
jest.mock('react-native-track-player', () => ({
  default: {
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    updateOptions: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue('none'),
    getPosition: jest.fn().mockResolvedValue(0),
    getDuration: jest.fn().mockResolvedValue(0),
    getCurrentTrack: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeUpcomingTracks: jest.fn().mockResolvedValue(undefined),
    updateMetadataForTrack: jest.fn().mockResolvedValue(undefined),
  },
  Capability: {
    Play: 'play', Pause: 'pause', Stop: 'stop',
    SeekTo: 'seekTo', JumpForward: 'jump-forward', JumpBackward: 'jump-backward',
  },
  Event: {
    PlaybackState: 'playback-state', PlaybackError: 'playback-error',
    PlaybackQueueEnded: 'playback-queue-ended', RemotePlay: 'remote-play',
    RemotePause: 'remote-pause', RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next', RemotePrevious: 'remote-previous',
  },
  State: {
    None: 'none', Ready: 'ready', Playing: 'playing',
    Paused: 'paused', Stopped: 'stopped', Buffering: 'buffering', Error: 'error',
  },
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
}));

// ─── expo-audio ──────────────────────────────────────────────────────────────
// jest-expo auto-mock 미포함 → 수동 mock 유지
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    get volume() { return 1; },
    set volume(_v: number) {},
    get currentTime() { return 0; },
    get duration() { return 60; },
    get playing() { return false; },
  })),
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    isLoaded: true, currentTime: 0, duration: 60, didJustFinish: false,
  })),
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null,
    isRecording: false,
  })),
  useAudioRecorderState: jest.fn(() => ({
    isRecording: false, metering: undefined,
  })),
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted', canAskAgain: true, granted: true,
  }),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted', granted: true,
  }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));
```

### 2. advanceTimersByTimeAsync 변환 — 4파일 수동 처리

변환 패턴 (모든 경우에 동일 적용):

```typescript
// Before
await vi.advanceTimersByTimeAsync(N);

// After (패턴 A — 유일 권장)
jest.advanceTimersByTime(N);
await Promise.resolve();
```

#### AudioEngine-timer.test.ts 변환 대상 (상단 vi.* 포함)

파일 상단 `vi.mock(...)` / `vi.fn()` / `vi.useFakeTimers()` / `vi.clearAllMocks()` / `vi.setSystemTime()` / `vi.useRealTimers()` 모두 `jest.*` 로 변환.

`await vi.advanceTimersByTimeAsync(N)` 발생 위치 (전체):
- AC-06: `await vi.advanceTimersByTimeAsync(5_000)` (2회)
- AC-06 경계값: `await vi.advanceTimersByTimeAsync(60_000)`
- AC-07: `await vi.advanceTimersByTimeAsync(5_000)` (3회)
- AC-08: `await vi.advanceTimersByTimeAsync(65_000)`
- AC-09: `await vi.advanceTimersByTimeAsync(1_740_000)`
- AC-10: `await vi.advanceTimersByTimeAsync(60_000)`
- Edge case: `await vi.advanceTimersByTimeAsync(0)`

총 약 11곳 → 패턴 A로 교체.

#### S01SplashScreen.test.tsx 변환 대상

상단 `vi.fn()` → `jest.fn()`, `vi.clearAllMocks()` → `jest.clearAllMocks()`, `vi.useFakeTimers()` → `jest.useFakeTimers()`, `vi.useRealTimers()` → `jest.useRealTimers()`.

`vi.mock(...)` → `jest.mock(...)` (각 모듈 mock).

`(jwtDecode as ReturnType<typeof vi.fn>)` → `(jwtDecode as jest.Mock)`.

`await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS)` → 패턴 A (여러 곳).

#### S10RecordScreen.bgm.test.tsx 변환 대상

파일 상단 explicit import 제거:
```typescript
// 제거 대상
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest'
```

jest-expo preset 환경에서는 `describe`, `expect`, `it`, `beforeEach`, `afterEach` 가 글로벌. `jest` 글로벌도 자동 주입. `vi` 글로벌은 없으므로 `vi.fn()` → `jest.fn()`, `vi.mock()` → `jest.mock()`.

`await vi.advanceTimersByTimeAsync(3500)` → 패턴 A.

`vi.importActual` → `jest.requireActual` (jest 동등 API):
```typescript
// Before
const actual = await vi.importActual<object>('@react-navigation/native')

// After
const actual = jest.requireActual('@react-navigation/native')
// jest.mock factory는 async 불필요 — 동기 변환
```

#### useBgmPlayer.test.ts 변환 대상

상단 explicit import 제거 (`from 'vitest'`).

`vi.fn()` → `jest.fn()`, `vi.mock()` → `jest.mock()`, `vi.useFakeTimers()` → `jest.useFakeTimers()`, `vi.useRealTimers()` → `jest.useRealTimers()`.

`await vi.advanceTimersByTimeAsync(N)` → 패턴 A (총 5~6곳).

### 3. __mocks__ 파일 검토

`react-native-track-player.js`: ES module `export` 사용 중. jest-expo + babel-jest 환경에서 babel-preset-expo가 ESM → CJS 변환. 동작 여부 실행으로 확인. 문제 발생 시 `module.exports = { ... }` CJS 방식으로 교체.

`react-native-google-mobile-ads.js`: 동일 검토.

`stubs/react-native-purchases.js`: 동일 검토.

변환 필요 여부는 `npm test -- --testPathPattern=minimal` 실행으로 확인.

---

## 구현 레시피 (순서)

1. `apps/mobile/src/__tests__/setup.ts` 전면 재작성 (위 내용)
2. `AudioEngine-timer.test.ts`: 상단 vi.mock 블록 jest.mock으로 변환 → advanceTimersByTimeAsync 패턴 A 변환
3. `S01SplashScreen.test.tsx`: vi.* 전환 → advanceTimersByTimeAsync 패턴 A 변환
4. `S10RecordScreen.bgm.test.tsx`: vitest import 제거 → vi.* → jest.* → vi.importActual → jest.requireActual → advanceTimersByTimeAsync 패턴 A
5. `useBgmPlayer.test.ts`: vitest import 제거 → vi.* → jest.* → advanceTimersByTimeAsync 패턴 A
6. `npm test src/__tests__/audio/AudioEngine-timer.test.ts` → GREEN 확인
7. `npm test src/__tests__/screens/S01SplashScreen.test.tsx` → GREEN 확인
8. `npm test src/__tests__/screens/S10RecordScreen.bgm.test.tsx` → GREEN 확인
9. `npm test src/__tests__/useBgmPlayer.test.ts` → GREEN 확인
10. `npx tsc --project tsconfig.test.json --noEmit` → 에러 0 확인

---

## 수용 기준

- (TEST) `npx tsc --project tsconfig.test.json --noEmit` 에러 없음
- (MANUAL) `grep -r "from 'vitest'" apps/mobile/src/__tests__/` 결과 0건
- (MANUAL) `grep -r "advanceTimersByTimeAsync" apps/mobile/src/__tests__/` 결과 0건
- (TEST) `npm test -- --testPathPattern=setup` 실행 시 setup 로드 에러 없음
- (TEST) `npm test src/__tests__/audio/AudioEngine-timer.test.ts` GREEN
- (TEST) `npm test src/__tests__/screens/S01SplashScreen.test.tsx` GREEN
- (TEST) `npm test src/__tests__/screens/S10RecordScreen.bgm.test.tsx` GREEN
- (TEST) `npm test src/__tests__/useBgmPlayer.test.ts` GREEN

---

## 주의사항

- `jest.mock()` factory 내부에서 `jest.fn()` 참조는 hoisting 안전. vitest에서 `vi.fn()`과 동일 동작.
- `vi.setSystemTime()` → jest 동등: `jest.setSystemTime()` (jest 27+에서 `useFakeTimers` 옵션 `{ now: Date }` 또는 `jest.setSystemTime(new Date(...))` 사용).
- `vi.clearAllMocks()` → `jest.clearAllMocks()` 직접 대응.
- `vi.spyOn()` → `jest.spyOn()` 직접 대응 (이 파일들에서 사용 여부 확인 후 변환).
- setup.ts의 `jest.mock('react-native', ...)`: jest-expo preset이 이미 react-native를 처리하는 방식과 충돌할 수 있음. 충돌 시 setup.ts의 react-native mock 블록 제거 후 jest-expo 기본 mock에 위임. 충돌 여부는 `npm test src/__tests__/screens/minimal.test.tsx` 로 먼저 확인.
