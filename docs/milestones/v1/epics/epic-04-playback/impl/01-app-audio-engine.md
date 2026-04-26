---
depth: deep
design: skipped
---

# impl/01 — AudioEngine (RNTP + expo-av 병렬, crossfade, seamless loop, 백그라운드)

**커버 스토리**: Story 2 (Seamless Loop), Story 3 (백그라운드 재생), Story 5 (Lockscreen 컨트롤)  
**선행 조건**: Epic 03 완료 (mp3 presigned URL + 로컬 캐시 경로 확보)  
**예상 소요**: 3~4일

---

## 1. 생성/수정 파일

| 경로 | 동작 | 비고 |
|---|---|---|
| `apps/mobile/src/audio/AudioEngine.ts` | 신규 생성 | 핵심 구현 파일 |
| `apps/mobile/src/audio/index.ts` | 신규 생성 | public re-export |
| `apps/mobile/src/store/playerSlice.ts` | 수정 | 신규 필드 추가 |
| `apps/mobile/src/audio/audioService.ts` | 신규 생성 | RNTP PlaybackService (background handler) |
| `apps/mobile/index.js` | 수정 | `TrackPlayer.registerPlaybackService()` 등록 |
| `apps/mobile/ios/Jajang/Info.plist` | 수정 | UIBackgroundModes audio 확인/추가 |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | 수정 | FOREGROUND_SERVICE_MEDIA_PLAYBACK 확인/추가 |

---

## 2. 의존 패키지 (설치 전 버전 확인 필수)

```bash
# RNTP v4 — docs/reference.md §RNTP 참조
yarn add react-native-track-player@^4.0.0

# expo-av — crossfade 두 번째 트랙 fade-in 전용
npx expo install expo-av

# expo-notifications — 타이머 1분 전 로컬 푸시
npx expo install expo-notifications
```

> **경고**: RNTP v4와 expo-av 동시 사용 시 iOS AVAudioSession 충돌 가능. `audio-engine.md §12 미결 사항` 참조. 반드시 실기기 테스트로 확인.

---

## 3. TS 인터페이스

### 3-1. PlayerSlice 신규 필드 (Zustand)

```typescript
// apps/mobile/src/store/playerSlice.ts 에 추가
interface PlayerSlice {
  // --- 기존 ---
  currentTrackId: string | null
  currentTrackUrl: string | null
  currentSongKey: string | null
  isPlaying: boolean
  volume: number                         // 0.0 ~ 1.0, 기본 0.8
  timerEndsAt: number | null             // timestamp ms

  // --- Epic 04 신규 ---
  pendingUpgradePrompt: 'background_blocked' | null
  notificationPermission: 'granted' | 'denied' | 'undetermined'
  showTimerWarningBanner: boolean
  rewardedUnlockExpiresAt: number | null // 자정 timestamp (당일만)
}
```

### 3-2. AudioEngine 공개 API

```typescript
// apps/mobile/src/audio/AudioEngine.ts

// 초기화 — 앱 최초 1회 (index.js에서 호출)
export async function setupAudioEngine(): Promise<void>

// 재생 시작 — S13 진입 시 호출
export async function startPlayback(params: {
  trackId: string
  trackUrl: string   // presigned URL 또는 로컬 file:// 경로
  songKey: string
}): Promise<void>

// 재생 제어
export async function pausePlayback(): Promise<void>
export async function resumePlayback(): Promise<void>
export async function stopPlayback(): Promise<void>  // 타이머/10시간 종료 시

// 볼륨 (0.0~1.0)
export async function setVolume(level: number): Promise<void>

// 타이머
export function setTimer(durationMs: number): void
export function clearTimer(): void

// 상태 조회 (Zustand 경유)
export function getIsPlaying(): boolean
export function getTimerRemainingMs(): number | null

// 잠금 상태
export function isVolumeControlLocked(): boolean  // crossfade 중 true
```

---

## 4. 핵심 로직 의사코드

### 4-1. setupAudioEngine

```typescript
export async function setupAudioEngine() {
  await TrackPlayer.setupPlayer({
    // iOS: AVAudioSession category = playback (백그라운드 허용)
    // Android: ExoPlayer 기본 설정
  })

  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause],
  })

  // PlaybackService 등록은 index.js에서: TrackPlayer.registerPlaybackService(() => require('./src/audio/audioService'))
}
```

### 4-2. startPlayback

```typescript
const CROSSFADE_MS = 300
const CROSSFADE_TRIGGER_OFFSET_S = 0.5
const MAX_PLAY_MS = 10 * 60 * 60 * 1000

export async function startPlayback({ trackId, trackUrl, songKey }) {
  // 1. 기존 재생 정리
  await TrackPlayer.reset()
  clearAllTimers()

  // 2. RNTP에 트랙 추가
  await TrackPlayer.add({
    id: trackId,
    url: trackUrl,
    title: SONG_NAMES[songKey] ?? songKey,
    artist: '내 목소리로 만든 자장가',
    artwork: 'https://assets.jajang.app/album-art.png',
  })
  await TrackPlayer.play()

  // 3. Zustand 업데이트
  usePlayerStore.setState({
    currentTrackId: trackId,
    currentTrackUrl: trackUrl,
    currentSongKey: songKey,
    isPlaying: true,
  })

  // 4. crossfade 트리거 이벤트 구독
  crossfadeListenerRef = TrackPlayer.addEventListener(
    Event.PlaybackProgressUpdated,
    ({ position, duration }) => {
      if (duration > 0 && duration - position <= (CROSSFADE_MS / 1000) + CROSSFADE_TRIGGER_OFFSET_S) {
        triggerCrossfade(trackUrl)
      }
    }
  )

  // 5. 10시간 자동 종료 타이머 (수면 타이머 미설정 시)
  const { timerEndsAt } = usePlayerStore.getState()
  if (!timerEndsAt) {
    maxPlayTimerRef = setTimeout(() => fadeOutAndStop('max_playtime_reached'), MAX_PLAY_MS)
  }
}
```

### 4-3. crossfade (audio-engine.md §3 구현)

```typescript
let isCrossfading = false
let currentNextSound: Audio.Sound | null = null

async function triggerCrossfade(trackUrl: string) {
  if (isCrossfading) return
  isCrossfading = true

  try {
    // expo-av로 두 번째 트랙 무음 로드 + 즉시 재생 시작
    const { sound: nextSound } = await Audio.Sound.createAsync(
      { uri: trackUrl },
      { shouldPlay: true, volume: 0, positionMillis: 0 }
    )
    currentNextSound = nextSound

    const STEPS = 15
    const STEP_MS = CROSSFADE_MS / STEPS

    for (let i = 0; i <= STEPS; i++) {
      const progress = i / STEPS
      const userVolume = usePlayerStore.getState().volume
      await TrackPlayer.setVolume((1 - progress) * userVolume)
      await nextSound.setVolumeAsync(progress * userVolume)
      await sleep(STEP_MS)
    }

    // RNTP 트랙 재시작 (nextSound 역할 인계)
    await TrackPlayer.seekTo(0)
    const userVolume = usePlayerStore.getState().volume
    await TrackPlayer.setVolume(userVolume)

    // expo-av 정리
    await nextSound.unloadAsync()
    currentNextSound = null
  } catch (err) {
    // crossfade 실패 — RNTP seekTo(0)으로 fallback
    Sentry.captureException(err, { extra: { context: 'crossfade' } })
    await TrackPlayer.seekTo(0)
    await TrackPlayer.play()
  } finally {
    isCrossfading = false
  }
}

// crossfade 중 AppState background 전환 엣지케이스
// → handleBackgroundTransition()에서 isCrossfading 체크 후 pause
```

### 4-4. 10초 fade-out 종료

```typescript
async function fadeOutAndStop(reason: 'timer_expired' | 'max_playtime_reached') {
  const FADE_STEPS = 20
  const FADE_TOTAL_MS = 10_000
  const STEP_MS = FADE_TOTAL_MS / FADE_STEPS
  const userVolume = usePlayerStore.getState().volume

  for (let i = FADE_STEPS; i >= 0; i--) {
    await TrackPlayer.setVolume((i / FADE_STEPS) * userVolume)
    await sleep(STEP_MS)
  }

  await TrackPlayer.pause()
  clearAllTimers()
  usePlayerStore.setState({
    isPlaying: false,
    timerEndsAt: null,
    showTimerWarningBanner: false,
  })
  logger.info('playback_stopped', { reason })
}
```

### 4-5. 백그라운드 AppState 핸들러

```typescript
AppState.addEventListener('change', async (nextState) => {
  if (nextState === 'background') {
    const { entitlement, rewardedUnlockExpiresAt } = usePlayerStore.getState()
    const isRewardedActive = rewardedUnlockExpiresAt
      ? Date.now() < rewardedUnlockExpiresAt
      : false

    const canPlayBackground = entitlement === 'premium' || entitlement === 'trial' || isRewardedActive

    if (!canPlayBackground) {
      // crossfade 진행 중이면 중단 후 pause
      if (isCrossfading) {
        isCrossfading = false
        currentNextSound?.unloadAsync().catch(() => {})
        currentNextSound = null
      }
      await TrackPlayer.pause()
      usePlayerStore.setState({ pendingUpgradePrompt: 'background_blocked' })
    }
    // canPlayBackground = true → RNTP가 OS 레벨에서 백그라운드 유지
  }

  if (nextState === 'active') {
    const { pendingUpgradePrompt } = usePlayerStore.getState()
    if (pendingUpgradePrompt === 'background_blocked') {
      usePlayerStore.setState({ pendingUpgradePrompt: null })
      // UpgradeSheet (variant: 'background') 노출은 S13 useEffect에서 처리
    }
  }
})
```

### 4-6. Lockscreen 메타데이터 갱신

```typescript
// startPlayback 내부 또는 songKey 변경 시 호출
async function syncLockscreenMetadata(songKey: string) {
  await TrackPlayer.updateMetadataForTrack(0, {
    title: SONG_NAMES[songKey],
    artist: '내 목소리로 만든 자장가',
    artwork: 'https://assets.jajang.app/album-art.png',
  })
}
```

### 4-7. audioService.ts (RNTP PlaybackService)

```typescript
// apps/mobile/src/audio/audioService.ts
// RNTP가 별도 JS 스레드에서 실행하는 백그라운드 핸들러
import TrackPlayer, { Event } from 'react-native-track-player'

module.exports = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play())
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause())
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop())
}
```

---

## 5. 결정 근거

| 결정 | 대안 | 선택 이유 |
|---|---|---|
| RNTP + expo-av 병렬 crossfade | 네이티브 ExoPlayer/AVPlayer 래핑 | MVP 타임라인 내 1인 개발 유지보수 가능, JS 타이머 ±50ms 오차는 수면 체감 차이 없음 (`docs/audio-engine.md §2`, `docs/architecture.md §2`) |
| seekTo(0) 재사용 | 매 루프마다 TrackPlayer.reset() + add() | 10시간 루프에서 객체 재생성 없음 → 메모리 누수 방지 |
| crossfade 중 AppState background → pause | 계속 진행 | iOS에서 expo-av background 동작 미보장, 음질 이상 방지 |
| Sentry captureException in crossfade catch | 자동 재시도 | 재시도 루프가 또 다른 crossfade 중첩을 유발할 수 있음 |

---

## 6. 모듈 경계

- **AudioEngine → PlayerSlice**: 단방향 setState. PlayerSlice는 AudioEngine를 직접 호출하지 않음.
- **S13 PlayScreen → AudioEngine**: `startPlayback`, `pausePlayback`, `resumePlayback`, `setVolume` 호출.
- **S13 → PlayerSlice**: `pendingUpgradePrompt` watch → UpgradeSheet 노출 (impl/06 참조).
- **expo-av**: crossfade 전용, 백그라운드 오디오 세션 담당 아님. RNTP가 AudioSession 소유.
- **타이머 관리**: `timerRef`, `maxPlayTimerRef`, `crossfadeListenerRef`는 AudioEngine 모듈 스코프 변수. 외부 직접 접근 금지.

---

## 7. 수용 기준

| # | 시나리오 | 기대 결과 |
|---|---|---|
| AC-01 | 트랙 끝 0.5초 전 도달 | isCrossfading=true, expo-av Sound 생성, 300ms volume ramp 시작 |
| AC-02 | crossfade 완료 후 | RNTP seekTo(0) 재생, expo-av unload, 사용자 설정 볼륨 복원 |
| AC-03 | 10시간 경과 (타이머 미설정) | 10초 fade-out 후 isPlaying=false |
| AC-04 | Premium 유저 화면 잠금 | RNTP 계속 재생, lockscreen 미디어 카드 표시 |
| AC-05 | 무료 유저 화면 잠금 | RNTP pause(), pendingUpgradePrompt='background_blocked' |
| AC-06 | 무료 유저 앱 복귀 | pendingUpgradePrompt=null, S14 팝업 트리거 (impl/06 처리) |
| AC-07 | 잠금화면 ⏸ 탭 | RNTP pause, PlayerSlice isPlaying=false 동기화 |
| AC-08 | 이어폰 재생/일시정지 버튼 | RNTP RemotePlay/RemotePause 이벤트 처리 |
| AC-09 | crossfade 중 background 전환 | isCrossfading=false, expo-av unload, RNTP pause |
| AC-10 | 볼륨 슬라이더 crossfade 중 조작 | isVolumeControlLocked()=true → UI에서 무시 |

---

## 8. 플랫폼 설정 체크리스트

### iOS — Info.plist

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

### Android — AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<service
    android:name="com.doublesymmetry.trackplayer.service.PlayerService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />
```

---

## 9. 주의사항

- RNTP `setupPlayer()`는 앱 전체 생명주기에서 **1회만** 호출. index.js 최상단에서 `setupAudioEngine()`으로 처리.
- `TrackPlayer.registerPlaybackService()`는 `setupPlayer()` **이전**에 등록 필요. RNTP v4 공식 문서 확인.
- expo-av `Audio.Sound.createAsync()`의 `volume: 0` 파라미터가 iOS에서 실제 무음으로 시작하는지 실기기 확인 필수 (`docs/audio-engine.md §12` 미결 사항).
- Sentry DSN은 환경변수로 주입. 코드 하드코딩 금지.
- `sleep()` 헬퍼 함수는 `utils/sleep.ts`로 분리 (impl/02 이후 재사용 가능).
