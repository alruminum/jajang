# Audio Engine — 자장(Jajang)

**버전**: v1.0  
**작성일**: 2026-04-24

seamless loop + crossfade 구현, 10시간 재생, 타이머·볼륨·lockscreen·백그라운드 모드 설계.

---

## 1. 개요

AudioEngine은 react-native-track-player(RNTP)를 래핑하는 단일 모듈이다.  
앱 전체에서 하나의 인스턴스만 존재하며, Zustand PlayerSlice와 양방향 동기화한다.

```
[Zustand PlayerSlice] ←→ [AudioEngine] ←→ [RNTP (native)]
                                          ↑
                                     [AppState (background 감지)]
```

---

## 2. 아키텍처 결정: Crossfade 구현 방식

### 채택: (a) 두 트랙 병렬 재생 + volume ramp

상세 검토 근거 → [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) "crossfade 대안 검토" 섹션 참조.

**요약**: 1인 개발 체계에서 네이티브 모듈(대안 b) 신규 작성은 MVP 타임라인(10~14주) 초과. PRD 수용 기준("crossfade 300ms 이상") 위반인 단순 반복(대안 c)은 architect 단독으로 스펙 완화 불가. 대안 (a)의 JS 타이머 ±50ms 오차는 수면 상황 체감 차이 없음.

### RNTP v4 두 인스턴스 제약

RNTP v4는 단일 플레이어 인스턴스를 전제한다. 두 트랙 동시 볼륨 제어를 위해 다음 방법을 사용:

**방법: RNTP + expo-av 병렬 구성**
- **RNTP**: 메인 재생 트랙 (lockscreen 컨트롤, 백그라운드 모드 담당)
- **expo-av Sound**: crossfade 시 두 번째 트랙 fade-in (백그라운드 불필요, 오버랩 용도만)

구현 단계에서 RNTP v4 API 실제 동작 확인 후 단일 인스턴스 방식으로 단순화 가능하면 단순화한다. 관련 레퍼런스 → `docs/reference.md` §RNTP.

---

## 3. Crossfade 상세 구현

### 3-1. 타이밍 계산

```typescript
// apps/mobile/src/audio/AudioEngine.ts

const CROSSFADE_MS = 300;           // crossfade 지속 시간
const CROSSFADE_TRIGGER_OFFSET = 0.5; // 트랙 끝 0.5초 전에 crossfade 시작

// RNTP 진행 이벤트 (16ms 주기)
TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async ({ position, duration }) => {
  if (duration > 0 && duration - position <= (CROSSFADE_MS / 1000) + CROSSFADE_TRIGGER_OFFSET) {
    await startCrossfade();
  }
});
```

### 3-2. Crossfade 실행

```typescript
let isCrossfading = false;

async function startCrossfade() {
  if (isCrossfading) return;
  isCrossfading = true;

  // expo-av Sound로 두 번째 트랙 로드 (동일 URL)
  const { sound: nextSound } = await Audio.Sound.createAsync(
    { uri: currentTrackUrl },
    { shouldPlay: true, volume: 0, positionMillis: 0 }
  );

  const STEPS = 15;
  const STEP_MS = CROSSFADE_MS / STEPS;

  for (let i = 0; i <= STEPS; i++) {
    const progress = i / STEPS;
    // RNTP 메인 트랙 fade out
    await TrackPlayer.setVolume(1 - progress);
    // expo-av 트랙 fade in
    await nextSound.setVolumeAsync(progress);
    await sleep(STEP_MS);
  }

  // 전환 완료
  await TrackPlayer.reset();
  // 메인 RNTP 트랙을 새로 로드 (=nextSound 역할 이어받기)
  await TrackPlayer.add({ url: currentTrackUrl, id: generateId() });
  await TrackPlayer.setVolume(1.0);
  await TrackPlayer.play();
  // expo-av 정리
  await nextSound.unloadAsync();
  isCrossfading = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 3-3. 볼륨 상태 복원

crossfade 완료 후 사용자가 설정한 볼륨으로 복원:
```typescript
const userVolume = usePlayerStore.getState().volume; // 0.0 ~ 1.0
await TrackPlayer.setVolume(userVolume);
```

---

## 4. 10시간 연속 재생

### 메모리 누수 방지

10시간 동안 동일 파일을 반복 재생하는 구조. 트랙을 매번 새로 로드하지 않고 RNTP seek(0)으로 재사용:

```typescript
// crossfade 완료 후 RNTP 트랙 재사용 방법 (단일 트랙 방식 최적화)
await TrackPlayer.seekTo(0);
await TrackPlayer.play();
```

expo-av Sound 객체는 crossfade 완료 즉시 `unloadAsync()`로 해제. 메모리 누적 없음.

### 10시간 자동 종료

```typescript
const MAX_PLAY_MS = 10 * 60 * 60 * 1000; // 10시간

let playbackStartTime: number | null = null;
let maxPlayTimer: ReturnType<typeof setTimeout> | null = null;

async function startPlayback(trackUrl: string) {
  playbackStartTime = Date.now();
  // ...재생 시작...

  // 10시간 타이머 (타이머 미설정 시에만)
  if (!timerEndsAt) {
    maxPlayTimer = setTimeout(() => {
      fadeOutAndStop('max_playtime_reached');
    }, MAX_PLAY_MS);
  }
}
```

---

## 5. 타이머 (F8)

| 옵션 | ms |
|---|---|
| 30분 | 1,800,000 |
| 1시간 | 3,600,000 |
| 2시간 | 7,200,000 |
| 6시간 | 21,600,000 |
| 10시간 | 36,000,000 |

### 타이머 설정

```typescript
export async function setTimer(durationMs: number) {
  const endsAt = Date.now() + durationMs;
  
  // Zustand 업데이트 (잔여 시간 UI 표시)
  usePlayerStore.setState({ timerEndsAt: endsAt });
  
  // 기존 타이머 취소
  if (timerRef) clearTimeout(timerRef);
  if (maxPlayTimer) clearTimeout(maxPlayTimer);
  
  // 1분 전 알림 예약
  const oneMinBefore = durationMs - 60_000;
  if (oneMinBefore > 0) {
    setTimeout(() => notifyOneMinuteWarning(), oneMinBefore);
  }
  
  // 만료 시 fade-out 종료
  timerRef = setTimeout(() => {
    fadeOutAndStop('timer_expired');
  }, durationMs);
}
```

### 10초 Fade-out 종료

```typescript
async function fadeOutAndStop(reason: string) {
  const FADE_STEPS = 20;
  const FADE_MS = 10_000; // 10초
  const STEP_MS = FADE_MS / FADE_STEPS;
  
  for (let i = FADE_STEPS; i >= 0; i--) {
    await TrackPlayer.setVolume(i / FADE_STEPS);
    await sleep(STEP_MS);
  }
  
  await TrackPlayer.pause();
  usePlayerStore.setState({
    isPlaying: false,
    timerEndsAt: null,
  });
  
  logger.info('playback_stopped', { reason });
}
```

### 1분 전 알림

```typescript
async function notifyOneMinuteWarning() {
  const { notificationPermission } = usePlayerStore.getState();
  
  if (notificationPermission === 'granted') {
    // expo-notifications 로컬 푸시
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '자장',
        body: '1분 후 자장가가 끝나요',
        sound: false,
      },
      trigger: null, // 즉시 발송
    });
  } else {
    // 인앱 배너 (S13 화면 내 표시)
    usePlayerStore.setState({ showTimerWarningBanner: true });
  }
}
```

---

## 6. 볼륨 컨트롤

```typescript
// S13 볼륨 슬라이더 → AudioEngine
export async function setVolume(level: number) {
  // level: 0.0 ~ 1.0
  const clampedLevel = Math.max(0, Math.min(1, level));
  await TrackPlayer.setVolume(clampedLevel);
  usePlayerStore.setState({ volume: clampedLevel });
}

// crossfade 중에는 볼륨 lock (사용자 조작 무시)
export function isVolumeControlLocked(): boolean {
  return isCrossfading;
}
```

---

## 7. 백그라운드 재생 + AppState 제어

### AppState 이벤트 핸들러

```typescript
// apps/mobile/src/audio/AudioEngine.ts

import { AppState } from 'react-native';

AppState.addEventListener('change', async (nextState) => {
  if (nextState === 'background') {
    await handleBackgroundTransition();
  } else if (nextState === 'active') {
    await handleForegroundReturn();
  }
});

async function handleBackgroundTransition() {
  const { entitlement, rewardedUnlockExpiresAt } = usePlayerStore.getState();
  const isRewardedActive = rewardedUnlockExpiresAt
    ? Date.now() < rewardedUnlockExpiresAt
    : false;

  const canPlayBackground =
    entitlement === 'premium' ||
    entitlement === 'trial' ||
    isRewardedActive;

  if (!canPlayBackground) {
    await TrackPlayer.pause();
    // 플래그 세팅: foreground 복귀 시 S14 팝업 표시
    usePlayerStore.setState({ pendingUpgradePrompt: 'background_blocked' });
  }
  // 그 외: 백그라운드 재생 유지 (RNTP가 OS 레벨에서 처리)
}

async function handleForegroundReturn() {
  const { pendingUpgradePrompt } = usePlayerStore.getState();
  if (pendingUpgradePrompt === 'background_blocked') {
    usePlayerStore.setState({ pendingUpgradePrompt: null });
    // 네비게이션 레이어에서 S14 팝업 A 표시
    navigationRef.current?.navigate('UpgradeSheet', { variant: 'background' });
  }
}
```

---

## 8. Lockscreen 컨트롤 (F9)

### RNTP Capabilities 설정

```typescript
await TrackPlayer.updateOptions({
  capabilities: [
    Capability.Play,
    Capability.Pause,
    Capability.Stop,
  ],
  compactCapabilities: [Capability.Play, Capability.Pause],
  notificationCapabilities: [Capability.Play, Capability.Pause],
  // iOS: MPRemoteCommandCenter 자동 등록
  // Android: MediaSessionCompat 자동 등록
});
```

### 트랙 메타데이터 (Lockscreen 표시)

```typescript
const SONG_NAMES: Record<string, string> = {
  brahms: '브람스 자장가',
  mozart: '모차르트 자장가',
  schubert: '슈베르트 자장가',
  twinkle: 'Twinkle Twinkle Little Star',
  rockabye: 'Rock-a-bye Baby',
  hush: 'Hush Little Baby',
};

await TrackPlayer.updateMetadataForTrack(0, {
  title: SONG_NAMES[songKey],
  artist: '내 목소리로 만든 자장가',
  artwork: 'https://assets.jajang.app/album-art.png',  // 앨범 아트 CDN
});
```

---

## 9. 오프라인 저장 (Premium 전용, F12)

```typescript
import * as FileSystem from 'expo-file-system';

// 로컬 저장 경로
const OFFLINE_DIR = FileSystem.documentDirectory + 'tracks/';

export async function downloadTrackOffline(trackId: string, presignedUrl: string) {
  await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
  
  const localPath = `${OFFLINE_DIR}${trackId}.mp3`;
  const downloadResult = await FileSystem.downloadAsync(presignedUrl, localPath);
  
  if (downloadResult.status === 200) {
    // Zustand에 로컬 경로 저장
    usePlayerStore.setState(state => ({
      offlineTrackPaths: {
        ...state.offlineTrackPaths,
        [trackId]: localPath,
      }
    }));
    return localPath;
  }
  throw new Error('Download failed');
}

// 재생 시 오프라인 경로 우선 사용
export function resolveTrackUrl(trackId: string, remoteUrl: string): string {
  const offline = usePlayerStore.getState().offlineTrackPaths[trackId];
  return offline ?? remoteUrl;
}
```

---

## 10. AudioEngine 공개 API 요약

```typescript
// 초기화
setupAudioEngine(): Promise<void>

// 재생 제어
startPlayback(trackUrl: string, songKey: string): Promise<void>
pausePlayback(): Promise<void>
resumePlayback(): Promise<void>
stopPlayback(): Promise<void>

// 볼륨
setVolume(level: number): Promise<void>   // 0.0 ~ 1.0

// 타이머
setTimer(durationMs: number): void
clearTimer(): void

// 오프라인
downloadTrackOffline(trackId: string, presignedUrl: string): Promise<string>

// 상태 조회 (Zustand PlayerSlice 경유)
getIsPlaying(): boolean
getTimerRemainingMs(): number | null
```

---

## 11. 플랫폼별 설정 체크리스트

### iOS

```xml
<!-- ios/Jajang/Info.plist -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>

<!-- ATS 설정 (presigned URL HTTPS 보장) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
</dict>

<!-- 마이크 사용 설명 -->
<key>NSMicrophoneUsageDescription</key>
<string>부모님 목소리로 자장가를 만들기 위해 마이크가 필요해요</string>
```

### Android

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

<service
    android:name="com.doublesymmetry.trackplayer.service.PlayerService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="false" />
```

---

## 12. 미결 사항 (M1 구현 시 확정)

| 항목 | 현재 결정 | 확인 필요 |
|---|---|---|
| RNTP v4 두 트랙 동시 볼륨 제어 | RNTP + expo-av 병렬 | RNTP v4 `setVolume` 동작 확인 |
| expo-av 백그라운드 동작 | crossfade 전용, 백그라운드 불필요 | iOS 백그라운드에서 expo-av Sound 재생 가능 여부 |
| crossfade 중 AppState background 전환 | fade-out 중단 + pause | 엣지 케이스 처리 |
