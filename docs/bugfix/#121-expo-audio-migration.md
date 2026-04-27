---
depth: std
---
# impl: #121 expo-av → expo-audio 마이그레이션

## 구현 현황 (2026-04-27 기준)

| 항목 | 상태 | 커밋 |
|---|---|---|
| package.json `expo-audio` 전환 | ✅ 완료 | 0489275 |
| S07SongSelectScreen — `createAudioPlayer` 마이그레이션 | ✅ 완료 | 0489275 |
| S10RecordScreen — `useAudioRecorder` 마이그레이션 | ✅ 완료 | 0489275 |
| RecordScreen — `useAudioRecorder` 마이그레이션 | ✅ 완료 | 0489275 |
| S11PreviewScreen — `useAudioPlayer` 마이그레이션 | ✅ 완료 | 0489275 |
| AudioEngine.ts — crossfade `createAudioPlayer` 전환 | ✅ 완료 | 0489275 |
| setup.ts + S07 test mock 교체 | ✅ 완료 | 0489275 |
| S09 test — `getRecordingPermissionsAsync` 직접 mock으로 구현 | ✅ 완료 (plan 기술과 상이, 아래 주석 참조) | 0489275 |
| **S07 정지 회귀 패치** (`.pause()` before `.remove()`) | ❌ **미완료** | — |
| Android 실기기 최종 검증 | ❌ **미완료** | — |

> **S09 구현 방식 변경**: plan은 `usePermissions` 훅으로 기술했으나, 엔지니어가 `getRecordingPermissionsAsync`/`requestRecordingPermissionsAsync` 직접 호출로 구현 (setup.ts mock에도 해당 함수 포함). 테스트 통과 기준으로 이 방식이 채택됨 — plan 본문 S09 섹션은 참조용으로만 남김.

### ⚠️ 다음 엔지니어 작업: S07 정지 회귀 패치

`docs/bugfix/#121-expo-audio-migration.md` 최하단 **"후속 패치 — S07 정지 회귀"** 섹션을 읽고 `S07SongSelectScreen.tsx` 2곳 수정 후 실기기 검증.

---

## Overview

**증상**: Android 실기기(Galaxy S25) 및 에뮬레이터에서 UI는 재생 상태로 전환되나 실제 음원이 무음.  
**근본 원인**: `expo-av@16.0.8`은 Expo SDK 53에서 deprecated, SDK 55에서 Expo Go 제거. `AudioPlaybackConfiguration` 목록에 인스턴스 미생성 → ExoPlayer prepare 단계 좌초.  
**해결책**: 전체 `expo-av` 의존 제거 + `expo-audio` (SDK 55 공식 대체)로 마이그레이션.

---

## Depth 판정 근거: `std`

- 훅 기반 새 로직 구조 신설 (`useAudioPlayer`, `useAudioRecorder`, `usePermissions`)
- S07 테스트: `Audio.Sound.createAsync` mock → `useAudioPlayer`/`createAudioPlayer` mock으로 assertion 대상 변경
- S09 테스트: `Audio.getPermissionsAsync`/`requestPermissionsAsync` mock → `usePermissions` 훅 mock으로 assertion 대상 전환
- `setup.ts` expo-av 블록 전체 교체
- DOM/API assertion 대상 변경 → simple 금지 기준 해당

---

## 영향 파일 목록

| 파일 | 현재 expo-av 사용 | 변경 방향 |
|---|---|---|
| `apps/mobile/package.json` | `expo-av: ^16.0.8` | `expo-audio` 교체 |
| `apps/mobile/stubs/expo-av.js` | expo-av 전체 API 목록 정의 (런타임 미사용, 과거 vi.mock 참조용) | **삭제** — `vi.mock('expo-audio', factory)` 로 완전 대체. expo-audio 전용 stub 파일 신규 생성 불필요 |
| `src/screens/RecordGuideScreen.tsx` | `Audio.getPermissionsAsync/requestPermissionsAsync` | `usePermissions` hook |
| `src/screens/S07SongSelectScreen.tsx` | `Audio.Sound.createAsync`, `AVPlaybackStatus` | `createAudioPlayer` 명령형 |
| `src/screens/S10RecordScreen.tsx` | `Audio.Recording.createAsync`, `setAudioModeAsync` | `useAudioRecorder` + `setAudioModeAsync` |
| `src/screens/RecordScreen.tsx` | 동일 (S10과 거의 동일) | 동일 |
| `src/screens/S11PreviewScreen.tsx` | `Audio.Sound.createAsync`, `setAudioModeAsync` | `useAudioPlayer` + `setAudioModeAsync` |
| `src/audio/AudioEngine.ts` | `Audio.Sound.createAsync` (crossfade 전용) | `createAudioPlayer` 명령형 |
| `src/utils/audio-quality.ts` | import 없음 (JSDoc 주석에만 `expo-av` 언급) | JSDoc 12행 · 40~41행 주석을 `expo-audio` / `useAudioRecorderState` 기준으로 업데이트 |
| `src/__tests__/setup.ts` | `vi.mock('expo-av', ...)` 전체 블록 | `vi.mock('expo-audio', ...)` |
| `src/__tests__/screens/S07SongSelectScreen.test.tsx` | `vi.mock('expo-av', ...)` | `expo-audio` mock |
| `src/__tests__/screens/S09RecordGuideScreen.test.tsx` | `vi.mock('expo-av', ...)` | `usePermissions` mock |

---

## 사전 작업: 의존성 교체 + 스텁 삭제

```bash
cd apps/mobile

# expo-av 제거
npm uninstall expo-av

# expo-audio 설치 (SDK 호환 버전 자동 선택)
npx expo install expo-audio

# stubs/expo-av.js 삭제 (vi.mock('expo-audio', factory)로 완전 대체, 더 이상 불필요)
rm stubs/expo-av.js
```

> **주의**: `npx expo install`을 사용해야 SDK 55 호환 버전이 자동 선택된다. `npm install expo-audio`는 버전 불일치 위험.
> **stubs/expo-av.js 삭제 근거**: 이 파일은 babel.config.js module-resolver alias 제거 이후 런타임에서 이미 미사용 상태. 테스트에서도 `vi.mock('expo-av', factory)` factory가 직접 mock 객체를 반환하므로 물리적 스텁 파일을 참조하지 않는다. expo-audio 전용 stub 파일 신규 생성도 불필요 — `vi.mock('expo-audio', factory)` 인라인 factory가 동일한 역할을 수행.

### package.json 변경

```diff
- "expo-av": "^16.0.8",
+ "expo-audio": "~0.4.x",   // npx expo install 결과 버전으로 자동 결정
```

---

## API 매핑 테이블

> 설치 후 `node_modules/expo-audio/build/index.d.ts` 에서 실제 타입 확인 필수. 아래는 공식 SDK 55 기준 매핑.

| expo-av (구) | expo-audio (신) | 비고 |
|---|---|---|
| `Audio.Sound.createAsync(src, {shouldPlay})` | `createAudioPlayer(src)` + `.play()` | 명령형. React 밖 가능 |
| `useAudioPlayer(src)` hook | `useAudioPlayer(src)` | React 컴포넌트 내부 |
| `sound.setOnPlaybackStatusUpdate(cb)` | player 이벤트 or `useAudioPlayerStatus` | 아래 상세 참고 |
| `sound.unloadAsync()` | `player.remove()` | cleanup |
| `sound.pauseAsync()` | `player.pause()` | |
| `sound.playAsync()` | `player.play()` | |
| `sound.setVolumeAsync(v)` | `player.volume = v` | setter (setter 직접 할당) |
| `sound.setPositionAsync(ms)` | `player.seekTo(sec)` | 초 단위 |
| `status.positionMillis` | `status.currentTime * 1000` | 또는 `player.currentTime` (초) |
| `status.durationMillis` | `status.duration * 1000` | 또는 `player.duration` (초) |
| `status.didJustFinish` | `status.didJustFinish` | 동일 필드명 |
| `status.isLoaded` | `status.isLoaded` | 동일 |
| `Audio.Recording.createAsync(opts, cb, interval)` | `useAudioRecorder(opts)` + `.prepareToRecordAsync()` + `.record()` | 훅 방식으로 전환 |
| `recording.stopAndUnloadAsync()` | `await recorder.stop()` | URI는 `recorder.uri` |
| `recording.getURI()` | `recorder.uri` | stop() 이후 |
| `recording.getStatusAsync()` | `useAudioRecorderState(recorder, intervalMs)` | metering용 상태 구독 |
| `Audio.setAudioModeAsync({allowsRecordingIOS, playsInSilentModeIOS})` | `setAudioModeAsync({allowsRecordingIOS, playsInSilentModeIOS})` | import 경로만 변경 |
| `Audio.getPermissionsAsync()` | `usePermissions()` hook | `[permission, requestPermission]` |
| `Audio.requestPermissionsAsync()` | `usePermissions()` → `requestPermission()` | hook 반환값 |
| `Audio.RecordingOptions` | `RecordingOptions` from `expo-audio` | 구조 다름(아래 참고) |

### RecordingOptions 구조 변경

expo-av의 플랫폼별 중첩 구조 → expo-audio는 플랫폼 공통 필드로 단일화:

```ts
// expo-av (구)
const opts: Audio.RecordingOptions = {
  isMeteringEnabled: true,
  android: { extension: '.wav', sampleRate: 16000, numberOfChannels: 1, bitRate: 256000, ... },
  ios:     { extension: '.wav', sampleRate: 16000, numberOfChannels: 1, bitRate: 256000, ... },
};

// expo-audio (신) — 확인 필요: .d.ts 참조
import { RecordingOptions } from 'expo-audio';
const opts: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  // android/ios 중첩 없이 공통 필드 사용
  // isMeteringEnabled: true  ← 필드명 동일한지 .d.ts 확인
};
```

> **engineer 필수 확인**: `RecordingOptions` 정확한 필드는 설치 후 `.d.ts` 에서 확인. `AndroidOutputFormat`, `AndroidAudioEncoder`, `IOSOutputFormat`, `IOSAudioQuality` 등 enum 경로도 변경 가능.

---

## 구현 계획 per-file

### 1. RecordGuideScreen.tsx

**현재**: 버튼 탭 핸들러에서 `Audio.getPermissionsAsync()` → 조건 분기 → `Audio.requestPermissionsAsync()`.

**변경 후**:
```tsx
import { usePermissions } from 'expo-audio';

export function RecordGuideScreen(...) {
  const [permission, requestPermission] = usePermissions();

  const handleStartRecording = async () => {
    if (permission?.status === 'granted') {
      navigation.navigate('Record', { mode, songKey: '' });
      return;
    }

    if (permission?.canAskAgain) {
      const result = await requestPermission();
      if (result?.status === 'granted') {
        navigation.navigate('Record', { mode, songKey: '' });
      } else {
        setShowPermissionModal(true);
      }
      return;
    }

    // canAskAgain=false → 즉시 모달
    setShowPermissionModal(true);
  };
  // ...
}
```

**주의**: `usePermissions()` 훅이 반환하는 `permission` 객체에 `canAskAgain`, `status` 필드가 있는지 `.d.ts` 확인. S09 테스트 mock도 함께 업데이트.

---

### 2. S07SongSelectScreen.tsx (미리듣기)

**현재**: `soundRef: useRef<Audio.Sound | null>` + `Audio.Sound.createAsync` 명령형.

**변경 후**: expo-audio의 `createAudioPlayer` 명령형 API 사용 (React 컴포넌트 내부지만 동적 소스 변경이 잦아 ref 패턴 유지).

```tsx
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// ref 타입 변경
const playerRef = useRef<AudioPlayer | null>(null);

// 언마운트 정리
useEffect(() => {
  return () => { playerRef.current?.remove(); };
}, []);

// handlePreviewToggle 핵심 변경
const handlePreviewToggle = async (songKey: string) => {
  // 기존 player 정리
  playerRef.current?.remove();
  playerRef.current = null;

  if (previewingKey === songKey) {
    setPreviewingKey(null);
    return;
  }

  setPreviewLoadingKey(songKey);
  try {
    const { preview_url } = await songsApi.getPreviewUrl(songKey);
    const player = createAudioPlayer({ uri: preview_url });
    playerRef.current = player;
    player.play();
    setPreviewingKey(songKey);

    // 재생 완료 감지 — addListener API 확인 필요
    // 옵션 A: player.addListener('playToEnd', cb)  ← .d.ts 확인
    // 옵션 B: useAudioPlayerStatus(player) 로 컴포넌트 내에서 effect 감지
    // 권장: 옵션 A (명령형 패턴 일관성 유지)
    player.addListener('playToEnd', () => {
      setPreviewingKey(null);
      player.remove();
      playerRef.current = null;
    });
  } catch {
    Alert.alert('', '미리듣기를 불러오지 못했어요');
  } finally {
    setPreviewLoadingKey(null);
  }
};
```

> **engineer 필수 확인**: `createAudioPlayer` 반환 타입 `AudioPlayer`의 이벤트 리스너 API (`addListener` 메서드명, 이벤트명 `'playToEnd'` 여부). `.d.ts` 에서 정확한 이벤트명 확인.  
> 대안: `useAudioPlayerStatus(player)` 훅 + `useEffect`로 `status.didJustFinish` 감지.

**제거**: `import type { AVPlaybackStatus } from 'expo-av'` 삭제.

---

### 3. S10RecordScreen.tsx + RecordScreen.tsx (녹음)

두 파일이 거의 동일한 패턴. 함께 마이그레이션.

**현재**:
- `Audio.setAudioModeAsync({ allowsRecordingIOS: true, ... })`
- `Audio.Recording.createAsync(options, meteringCallback, 100)`
- `rec.stopAndUnloadAsync()` + `rec.getURI()`
- `recordingRef: useRef<Audio.Recording | null>`

**변경 후**:
```tsx
import { useAudioRecorder, useAudioRecorderState, setAudioModeAsync } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';

// RecordingOptions 재정의 (expo-audio 구조로)
const RECORDING_OPTIONS: RecordingOptions = {
  // .d.ts 확인 후 정확한 필드로 채울 것
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  // isMeteringEnabled 유무 확인
};

export default function S10RecordScreen(...) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  // metering 상태 구독 (100ms 간격)
  const recorderState = useAudioRecorderState(recorder, 100);
  // recorderState.metering: number | undefined (dBFS)

  const startRecording = async () => {
    try {
      await setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      // 경과 시간 타이머 시작 (기존 로직 유지)
    } catch {
      Alert.alert('', '녹음을 시작할 수 없어요. 마이크 권한을 확인해주세요');
      navigation.goBack();
    }
  };

  // metering → levels 처리: recorderState 변경을 useEffect로 감지
  useEffect(() => {
    if (!recorderState.isRecording) return;
    const level = meteringToLevel(recorderState.metering);
    // 기존 levels 배열 업데이트 로직 동일
    const nextLevels = [...levelsRef.current.slice(-39), level];
    levelsRef.current = nextLevels;
    setLevels(nextLevels);
    // 무음 감지 로직 동일
  }, [recorderState]);

  // 녹음 정리 변경
  const cleanupRecording = async (): Promise<string | null> => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!recorder.isRecording) return null;  // isRecording 필드 확인 필요
    try {
      await recorder.stop();
      return recorder.uri ?? null;  // uri 필드 확인 필요
    } catch {
      return null;
    }
  };
  // ...
}
```

> **engineer 필수 확인**:
> - `useAudioRecorder` 훅 반환 객체의 정확한 메서드: `prepareToRecordAsync()`, `record()`, `stop()` 여부
> - `recorder.uri` vs `stop()` 반환값으로 URI 접근 방식
> - `useAudioRecorderState` 반환 타입의 `metering`, `isRecording` 필드명
> - `recordingRef.current`는 더 이상 불필요 — `recorder`가 훅으로 관리됨

**`RecordingOptions` 타입 참조**: `Audio.AndroidOutputFormat`, `Audio.AndroidAudioEncoder`, `Audio.IOSOutputFormat`, `Audio.IOSAudioQuality` enum들은 expo-audio에서 경로가 변경될 수 있음 → `.d.ts` 확인 후 필요 없으면 삭제, expo-audio 자체 enum으로 교체.

---

### 4. S11PreviewScreen.tsx (녹음 미리보기 재생)

**현재**:
- `soundRef: useRef<Audio.Sound | null>`
- `Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true })`
- `Audio.Sound.createAsync({ uri: localAudioUri }, { shouldPlay: false }, statusCallback)`
- `status.positionMillis`, `status.didJustFinish`, `status.durationMillis`
- `sound.pauseAsync()`, `sound.playAsync()`, `sound.setPositionAsync(0)`

**변경 후**:
```tsx
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

// localAudioUri가 확정된 후 player 생성
const player = useAudioPlayer(localAudioUri ? { uri: localAudioUri } : null);
const status = useAudioPlayerStatus(player);

// useEffect — setAudioModeAsync + 언마운트 cleanup
useEffect(() => {
  if (!localAudioUri) { navigation.goBack(); return; }
  setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  return () => { player.remove(); };
}, []);

// durationSec, positionSec 파생 (status 기반)
const durationSec = (status?.duration ?? 0);         // 초 단위
const positionSec = (status?.currentTime ?? 0);       // 초 단위

// didJustFinish 처리
useEffect(() => {
  if (status?.didJustFinish) {
    setIsPlaying(false);
    player.seekTo(0);
  }
}, [status?.didJustFinish]);

// 재생/정지 토글
const handlePlayToggle = () => {
  if (isPlaying) {
    player.pause();
    setIsPlaying(false);
  } else {
    player.play();
    setIsPlaying(true);
  }
};
```

> **engineer 확인**: `useAudioPlayerStatus` 반환 타입의 `duration`, `currentTime`, `didJustFinish` 필드명 (매핑 테이블 참고). `player.seekTo(sec)` 메서드 시그니처.  
> `soundRef.current` 패턴은 제거 — `player`가 훅으로 생명주기 관리됨.

---

### 5. AudioEngine.ts (crossfade 전용 expo-av 제거)

**현재**: `Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 0 })` → crossfade 중 `nextSound.setVolumeAsync()`, `nextSound.unloadAsync()`

AudioEngine은 React 컴포넌트 밖 모듈 스코프이므로 훅 사용 불가 → `createAudioPlayer` 명령형 API 사용.

```ts
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// 모듈 스코프
let currentNextPlayer: AudioPlayer | null = null;  // Audio.Sound → AudioPlayer

async function triggerCrossfade(trackUrl: string): Promise<void> {
  if (isCrossfading) return;
  isCrossfading = true;

  try {
    // expo-audio 명령형 player 생성
    const nextPlayer = createAudioPlayer({ uri: trackUrl });
    nextPlayer.volume = 0;
    nextPlayer.play();
    currentNextPlayer = nextPlayer;

    const STEP_MS = CROSSFADE_MS / CROSSFADE_STEPS;
    for (let i = 0; i <= CROSSFADE_STEPS; i++) {
      const progress = i / CROSSFADE_STEPS;
      const userVolume = usePlayerStore.getState().volume;
      await TrackPlayer.setVolume((1 - progress) * userVolume);
      nextPlayer.volume = progress * userVolume;  // setter 직접 할당
      await sleep(STEP_MS);
    }

    await TrackPlayer.seekTo(0);
    const userVolume = usePlayerStore.getState().volume;
    await TrackPlayer.setVolume(userVolume);

    nextPlayer.remove();  // unloadAsync() → remove()
    currentNextPlayer = null;
  } catch (err) {
    console.error('[AudioEngine] crossfade error, fallback to seekTo(0):', err);
    try { await TrackPlayer.seekTo(0); await TrackPlayer.play(); }
    catch (e) { console.error('[AudioEngine] fallback failed:', e); }
  } finally {
    isCrossfading = false;
    currentNextPlayer = null;
  }
}

// stopPlayback 등에서 currentNextSound → currentNextPlayer로 동일하게 교체
```

**변경 사항**:
- `import { Audio } from 'expo-av'` → `import { createAudioPlayer } from 'expo-audio'`
- `Audio.Sound | null` → `AudioPlayer | null`
- `currentNextSound` → `currentNextPlayer`
- `nextSound.setVolumeAsync(v)` → `nextPlayer.volume = v`
- `nextSound.unloadAsync()` → `nextPlayer.remove()`
- `currentNextSound?.unloadAsync().catch(() => {})` → `currentNextPlayer?.remove()` (동기 cleanup)

> **engineer 확인**: `createAudioPlayer` 반환 `AudioPlayer`의 `volume` 필드가 getter/setter인지, `setVolume(v)` 메서드인지 `.d.ts` 에서 확인.  
> **주석 업데이트**: 파일 최상단 `* - expo-av: crossfade 전용...` 주석을 `* - expo-audio: crossfade 전용...`으로 수정.

---

## 테스트 mock 교체 스펙

### `src/__tests__/setup.ts`

```ts
// 제거 (133~153라인 전체 삭제)
// ─── expo-av ─────────────────────────────────────────────────────────────────
vi.mock('expo-av', () => ({ ... }));

// 추가 (expo-audio 전역 mock)
// ─── expo-audio ──────────────────────────────────────────────────────────────
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    get volume() { return 1; },
    set volume(_v: number) {},
    get currentTime() { return 0; },
    get duration() { return 60; },
    get playing() { return false; },
  })),
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn(),
  })),
  useAudioPlayerStatus: vi.fn(() => ({
    isLoaded: true,
    currentTime: 0,
    duration: 60,
    didJustFinish: false,
  })),
  useAudioRecorder: vi.fn(() => ({
    prepareToRecordAsync: vi.fn().mockResolvedValue(undefined),
    record: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    uri: null,
    isRecording: false,
  })),
  useAudioRecorderState: vi.fn(() => ({
    isRecording: false,
    metering: undefined,
  })),
  usePermissions: vi.fn(() => [
    { status: 'granted', canAskAgain: true, granted: true },
    vi.fn().mockResolvedValue({ status: 'granted', granted: true }),
  ]),
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
}));
```

---

### `src/__tests__/screens/S07SongSelectScreen.test.tsx`

```ts
// 기존 (33~39라인) 제거
vi.mock('expo-av', () => ({
  Audio: { Sound: { createAsync: vi.fn() } },
}));

// 교체
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(),
}));

// 임포트 변경
// import { Audio } from 'expo-av'  →  import { createAudioPlayer } from 'expo-audio'

// mock sound 객체 → mock player 객체로 교체
function makeMockPlayer() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
}

// 테스트 본문 내 `Audio.Sound.createAsync` → `createAudioPlayer` mock 참조로 전환
// AC-09 (언마운트 시 unload): `sound.unloadAsync()` 호출 검증 → `player.remove()` 호출 검증으로 변경
```

---

### `src/__tests__/screens/S09RecordGuideScreen.test.tsx`

S09 테스트는 권한 흐름을 검증한다. `usePermissions` 훅 기반으로 전면 재작성.

```ts
// 제거 (12~23라인)
const mockGetPermissions = vi.fn()
const mockRequestPermissions = vi.fn()
vi.mock('expo-av', () => ({
  Audio: {
    getPermissionsAsync: mockGetPermissions,
    requestPermissionsAsync: mockRequestPermissions,
    ...
  }
}))

// 교체: usePermissions 훅 mock
const mockPermission = { status: 'granted', canAskAgain: true, granted: true }
const mockRequestPermission = vi.fn()

vi.mock('expo-audio', () => ({
  usePermissions: vi.fn(),
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  // ⚠️ expo-audio에는 Audio.Sound.createAsync가 없다 — expo-av 패턴 사용 금지
  // S09(RecordGuideScreen) 테스트 대상 API: usePermissions, setAudioModeAsync 만 해당
  // 전역 setup.ts mock에서 이미 usePermissions를 주입하므로, 이 파일 로컬 mock은
  // 테스트별 반환값 제어(vi.mocked(usePermissions).mockReturnValue(...))에만 집중
}))

import { usePermissions } from 'expo-audio'

// 각 테스트에서 usePermissions 반환값 제어
// REQ-01 (granted):
vi.mocked(usePermissions).mockReturnValue([
  { status: 'granted', canAskAgain: true, granted: true },
  mockRequestPermission,
])

// REQ-02 (canAskAgain=true, request → granted):
mockRequestPermission.mockResolvedValue({ status: 'granted', granted: true })
vi.mocked(usePermissions).mockReturnValue([
  { status: 'denied', canAskAgain: true, granted: false },
  mockRequestPermission,
])

// REQ-03/04 (canAskAgain=false):
vi.mocked(usePermissions).mockReturnValue([
  { status: 'denied', canAskAgain: false, granted: false },
  mockRequestPermission,
])
```

**검증 포인트 변경**:
- `expect(mockGetPermissions).toHaveBeenCalled()` → 삭제 (훅이 자동 조회)
- `expect(mockRequestPermissions).not.toHaveBeenCalled()` → `expect(mockRequestPermission).not.toHaveBeenCalled()`
- REQ-01/02: navigate 검증은 동일 유지
- REQ-03/04: 모달 표시 검증은 동일 유지

---

## 구현 순서 권고

```
1. package.json 의존성 교체 (npm uninstall expo-av + npx expo install expo-audio)
   + stubs/expo-av.js 삭제 (rm apps/mobile/stubs/expo-av.js)
2. .d.ts 확인 (node_modules/expo-audio/build/index.d.ts)
   → API 매핑 테이블 실제 이름 검증, 불일치 시 수정
3. setup.ts mock 교체 (전역 mock이므로 먼저)
4. RecordGuideScreen.tsx 마이그레이션 + S09 test 업데이트
5. S07SongSelectScreen.tsx + S07 test 업데이트
6. S10RecordScreen.tsx + RecordScreen.tsx 마이그레이션
7. S11PreviewScreen.tsx 마이그레이션
8. AudioEngine.ts crossfade 교체
9. audio-quality.ts JSDoc 주석 업데이트 (12행 · 40~41행 expo-av → expo-audio/useAudioRecorderState 기준)
10. npx vitest run — 테스트 전체 통과 확인
11. Android 실기기 음원 재생 확인 (S07 미리듣기, S10 녹음, S11 미리보기)
```

---

## 검증 기준

| 항목 | 방법 |
|---|---|
| TypeScript 타입 오류 없음 | `npx tsc --noEmit` 통과 |
| 전체 테스트 통과 | `npx vitest run` 전체 pass |
| S07 미리듣기 Android 실기기 음원 출력 | Galaxy S25 + 에뮬레이터 수동 확인 |
| S10 녹음 정상 시작/종료 | 실기기 수동 확인 |
| S11 재생 미리보기 음원 출력 | 실기기 수동 확인 |
| expo-av import 전체 제거 | `grep -rn "from 'expo-av'" src/` 결과 0건 — JSDoc 주석 내 `expo-av` 언급은 위 audio-quality.ts 항목에서 별도 처리 |
| iOS 정상 동작 유지 | 시뮬레이터 회귀 확인 |

---

## 후속 패치 — S07 정지 회귀 (2026-04-27 실기기 검증 후 발견)

### 증상
실기기 Galaxy S25에서 brahms ▶ 탭 → 음원 정상 재생. 그러나 ⏸ 탭 또는 다른 곡 ▶ 탭 시 음원이 멈추지 않음. 앱 종료 시까지 계속 재생.

### 원인
expo-audio의 `createAudioPlayer` 명령형 API에서 `.remove()` 만 호출하면 Android ExoPlayer 출력이 즉시 중단되지 않는 케이스 존재. 정지 직전 `.pause()` 명시 호출 필요.

### 수정 (apps/mobile/src/screens/S07SongSelectScreen.tsx 2곳)

**1) useEffect cleanup (47~48라인 근처):**
```diff
     return () => {
-      playerRef.current?.remove();
+      playerRef.current?.pause();
+      playerRef.current?.remove();
     };
```

**2) handlePreviewToggle 시작부 (54~58라인 근처):**
```diff
     if (playerRef.current) {
+      playerRef.current.pause();
       playerRef.current.remove();
       playerRef.current = null;
     }
```

### 범위 외
- 다른 화면(S10/S11/RecordScreen/AudioEngine) 수정 금지 — 본 회귀는 S07 한정
- S11/RecordScreen은 useAudioPlayer/useAudioRecorder 훅 기반이라 동일 이슈 없음

### 검증 기준 (추가)
| 항목 | 방법 |
|---|---|
| 같은 곡 ⏸ 탭 → 음원 즉시 정지 | 실기기 수동 확인 |
| 다른 곡 ▶ 탭 → 이전 곡 즉시 정지 + 새 곡 재생 | 실기기 수동 확인 |
| 화면 이탈(unmount) → 재생 중 음원 정지 | 실기기 수동 확인 |
