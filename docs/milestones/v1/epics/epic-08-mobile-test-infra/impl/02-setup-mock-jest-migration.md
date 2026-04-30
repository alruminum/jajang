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

**파일 최상단에 vitest `import` 없음** — `vi.*` 를 전역으로 사용 (vitest 환경에서 자동 주입). jest 환경에서는 `jest.*` 전역으로 교체하면 됨. `from 'vitest'` import 제거 태스크 해당 없음.

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

**파일 최상단에 vitest `import` 없음** — `vi.*` 를 전역으로 bare 사용. jest 환경에서 `jest.*` 전역 교체.

상단 `vi.fn()` → `jest.fn()`, `vi.clearAllMocks()` → `jest.clearAllMocks()`, `vi.useFakeTimers()` → `jest.useFakeTimers()`, `vi.useRealTimers()` → `jest.useRealTimers()`.

`vi.mock(...)` → `jest.mock(...)` (각 모듈 mock).

**타입 캐스팅 변환 필수**: 파일 내 `ReturnType<typeof vi.fn>` 캐스팅 → `jest.Mock` 으로 교체:
```typescript
// Before
(jwtDecode as ReturnType<typeof vi.fn>).mockReturnValue(...)
(AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(...)

// After
(jwtDecode as jest.Mock).mockReturnValue(...)
(AsyncStorage.getItem as jest.Mock).mockResolvedValue(...)
```

`await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS)` → 패턴 A (13곳). 이 파일의 경우 `act()` 래핑 없이 `await vi.advanceTimersByTimeAsync(...)` 직접 호출 형태이므로:
```typescript
// Before
await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

// After
jest.advanceTimersByTime(SPLASH_DELAY_MS);
await Promise.resolve();
```

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

`await vi.advanceTimersByTimeAsync(N)` → 패턴 A (총 7곳).

**중요 — act() 래핑 유지**: useBgmPlayer.test.ts 의 `advanceTimersByTimeAsync` 는 `act(async () => { ... })` 블록 내부에 있다. 패턴 A 변환 시 `act()` 래핑을 그대로 유지해야 한다:

```typescript
// Before
await act(async () => {
  await vi.advanceTimersByTimeAsync(30)
})

// After (패턴 A — act 래핑 유지)
await act(async () => {
  jest.advanceTimersByTime(30)
  await Promise.resolve()
})
```

S10RecordScreen.bgm.test.tsx 의 `advanceCountdown()` 헬퍼도 동일하게 act() 래핑 내에서 변환.

### 3. __mocks__ 파일 검토

`react-native-track-player.js` / `react-native-google-mobile-ads.js`: ES module `export` 사용 중. 두 파일 모두 `moduleNameMapper` 로 절대 경로 매핑되어 있어 `node_modules` 경로를 거치지 않음. `transformIgnorePatterns` 와 무관하게 babel-jest 가 해당 파일을 직접 변환. batch-01에서 이미 동작 확인된 구조이므로 CJS 변환 불필요.

단, **setup.ts 에 `jest.mock('react-native-track-player', ...)`를 명시적으로 선언할 경우** `moduleNameMapper` 매핑 + `jest.mock()` 이중 처리가 된다. `moduleNameMapper` 가 먼저 resolve 되면 `jest.mock()` factory 가 해당 모듈을 덮어씀. setup.ts 의 react-native-track-player mock 블록은 `moduleNameMapper` stub 보다 상세한 API surface 를 제공하므로 유지. `moduleNameMapper` 는 그대로 두고 setup.ts mock 이 override 하도록 허용.

`stubs/react-native-purchases.js`: `moduleNameMapper` 매핑만으로 처리, setup.ts 별도 mock 없음 — 유지.

변환 필요 여부는 `npm test src/__tests__/screens/_smoke.test.ts` (batch-01에서 GREEN 확인된 파일) 실행으로 먼저 확인.

---

## 구현 레시피 (순서)

1. `apps/mobile/src/__tests__/setup.ts` 전면 재작성 (위 내용)
2. `apps/mobile/jest.config.js`: `setupFilesAfterEnv` 복원 — 주석 해제 + 빈 배열 교체:
   ```js
   setupFilesAfterEnv: ['./src/__tests__/setup.ts'],
   ```
3. `AudioEngine-timer.test.ts`: vi.mock 블록 → jest.mock 변환 / `vi.useFakeTimers()` → `jest.useFakeTimers()` / `vi.setSystemTime()` → `jest.setSystemTime()` / `vi.clearAllMocks()` → `jest.clearAllMocks()` / `vi.useRealTimers()` → `jest.useRealTimers()` / advanceTimersByTimeAsync(N) → 패턴 A (11곳)
4. `S01SplashScreen.test.tsx`: vi.* → jest.* 전환 (bare 전역 사용) / `ReturnType<typeof vi.fn>` → `jest.Mock` / advanceTimersByTimeAsync → 패턴 A (13곳, act 래핑 없음)
5. `S10RecordScreen.bgm.test.tsx`: vitest explicit import 제거 (6줄 블록) / vi.* → jest.* / vi.importActual async → jest.requireActual 동기 변환 / advanceTimersByTimeAsync → 패턴 A (act 래핑 내부, 2곳)
6. `useBgmPlayer.test.ts`: vitest explicit import 제거 (1줄) / vi.* → jest.* / advanceTimersByTimeAsync → 패턴 A (act 래핑 내부, 7곳)
7. `npm test src/__tests__/audio/AudioEngine-timer.test.ts` → GREEN 확인
8. `npm test src/__tests__/screens/S01SplashScreen.test.tsx` → GREEN 확인
9. `npm test src/__tests__/screens/S10RecordScreen.bgm.test.tsx` → GREEN 확인
10. `npm test src/__tests__/useBgmPlayer.test.ts` → GREEN 확인
11. `npx tsc --project tsconfig.test.json --noEmit` → 에러 0 확인

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
