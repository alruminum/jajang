/**
 * AudioEngine — RNTP + expo-av 병렬 crossfade, seamless loop, 백그라운드 재생
 *
 * 커버 스토리: Story 2 (Seamless Loop), Story 3 (백그라운드 재생), Story 5 (Lockscreen 컨트롤)
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/01-app-audio-engine.md
 *
 * 모듈 경계:
 * - AudioEngine → PlayerSlice: 단방향 setState. PlayerSlice는 AudioEngine을 직접 호출하지 않음.
 * - S13 PlayScreen → AudioEngine: startPlayback, pausePlayback, resumePlayback, setVolume 호출.
 * - expo-av: crossfade 전용. 백그라운드 AudioSession은 RNTP가 소유.
 * - entitlement: useAuthStore에서 읽음 (usePlayerStore가 아님).
 */

import { AppState } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import TrackPlayer, { Capability, Event, State } from 'react-native-track-player';
import { Audio } from 'expo-av';
import { usePlayerStore } from '@store/player-store';
import { useAuthStore } from '@store/auth-store';
import { SONG_NAMES } from '@services/songs';
import { sleep } from '@utils/sleep';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const CROSSFADE_MS = 300;
const CROSSFADE_TRIGGER_OFFSET_S = 0.5;
const MAX_PLAY_MS = 10 * 60 * 60 * 1000; // 10시간
/** crossfade 볼륨 ramp 스텝 수 */
const CROSSFADE_STEPS = 15;

// ─── 모듈 스코프 상태 (외부 직접 접근 금지) ──────────────────────────────────

let isCrossfading = false;
let currentNextSound: Audio.Sound | null = null;

/** 사용자 설정 수면 타이머 ref */
let timerRef: ReturnType<typeof setTimeout> | null = null;
/** 수면 타이머 1분 전 경고 타이머 ref */
let warningTimerRef: ReturnType<typeof setTimeout> | null = null;
/** 10시간 최대 재생 자동 종료 타이머 ref */
let maxPlayTimerRef: ReturnType<typeof setTimeout> | null = null;
/** RNTP PlaybackProgressUpdated 이벤트 구독 ref */
let crossfadeListenerRef: EmitterSubscription | null = null;
/** 재생 시작 시각 (10시간 타이머 잔여 계산용) */
let playbackStartTime: number | null = null;

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function clearAllTimers(): void {
  if (timerRef !== null) {
    clearTimeout(timerRef);
    timerRef = null;
  }
  if (warningTimerRef !== null) {
    clearTimeout(warningTimerRef);
    warningTimerRef = null;
  }
  if (maxPlayTimerRef !== null) {
    clearTimeout(maxPlayTimerRef);
    maxPlayTimerRef = null;
  }
  if (crossfadeListenerRef !== null) {
    crossfadeListenerRef.remove();
    crossfadeListenerRef = null;
  }
}

/**
 * 타이머 1분 전 경고 알림.
 * - 알림 권한 있음: expo-notifications 즉시 로컬 푸시
 * - 알림 권한 없음: showTimerWarningBanner=true (인앱 배너 degrade)
 */
async function notifyOneMinuteWarning(): Promise<void> {
  const { notificationPermission } = usePlayerStore.getState();

  if (notificationPermission === 'granted') {
    try {
      // expo-notifications 동적 로드 (미설치 시 graceful fallback)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { scheduleNotificationAsync } = require('expo-notifications') as {
        scheduleNotificationAsync: (options: {
          content: { title: string; body: string; sound: boolean };
          trigger: null;
        }) => Promise<string>;
      };
      await scheduleNotificationAsync({
        content: {
          title: '자장',
          body: '1분 후 자장가가 끝나요',
          sound: false,
        },
        trigger: null, // 즉시 발송
      });
    } catch {
      // expo-notifications 미설치 또는 발송 실패 — 인앱 배너 degrade
      usePlayerStore.setState({ showTimerWarningBanner: true });
    }
  } else {
    // 인앱 배너 degrade (ux-flow.md S13 "타임아웃 1분 전 알림 거부" 경로)
    usePlayerStore.setState({ showTimerWarningBanner: true });
  }
}

async function triggerCrossfade(trackUrl: string): Promise<void> {
  if (isCrossfading) return;
  isCrossfading = true;

  try {
    // expo-av로 두 번째 트랙 무음 로드 + 즉시 재생 시작
    const { sound: nextSound } = await Audio.Sound.createAsync(
      { uri: trackUrl },
      { shouldPlay: true, volume: 0, positionMillis: 0 },
    );
    currentNextSound = nextSound;

    const STEP_MS = CROSSFADE_MS / CROSSFADE_STEPS;

    for (let i = 0; i <= CROSSFADE_STEPS; i++) {
      const progress = i / CROSSFADE_STEPS;
      const userVolume = usePlayerStore.getState().volume;
      await TrackPlayer.setVolume((1 - progress) * userVolume);
      await nextSound.setVolumeAsync(progress * userVolume);
      await sleep(STEP_MS);
    }

    // RNTP 트랙 재시작 (nextSound 역할 인계)
    await TrackPlayer.seekTo(0);
    const userVolume = usePlayerStore.getState().volume;
    await TrackPlayer.setVolume(userVolume);

    // expo-av 정리
    await nextSound.unloadAsync();
    currentNextSound = null;
  } catch (err) {
    // crossfade 실패 — RNTP seekTo(0)으로 fallback
    console.error('[AudioEngine] crossfade error, fallback to seekTo(0):', err);
    try {
      await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
    } catch (fallbackErr) {
      console.error('[AudioEngine] fallback seekTo failed:', fallbackErr);
    }
  } finally {
    isCrossfading = false;
    currentNextSound = null;
  }
}

async function fadeOutAndStop(reason: 'timer_expired' | 'max_playtime_reached'): Promise<void> {
  const FADE_STEPS = 20;
  const FADE_TOTAL_MS = 10_000;
  const STEP_MS = FADE_TOTAL_MS / FADE_STEPS;
  const userVolume = usePlayerStore.getState().volume;

  for (let i = FADE_STEPS; i >= 0; i--) {
    await TrackPlayer.setVolume((i / FADE_STEPS) * userVolume);
    await sleep(STEP_MS);
  }

  await TrackPlayer.pause();
  clearAllTimers();
  usePlayerStore.setState({
    isPlaying: false,
    timerEndsAt: null,
    showTimerWarningBanner: false,
  });
  console.info('[AudioEngine] playback_stopped', { reason });
}

async function syncLockscreenMetadata(songKey: string): Promise<void> {
  await TrackPlayer.updateMetadataForTrack(0, {
    title: SONG_NAMES[songKey] ?? songKey,
    artist: '내 목소리로 만든 자장가',
    artwork: 'https://assets.jajang.app/album-art.png',
  });
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * AudioEngine 초기화 — 앱 최초 1회 호출 (index.js에서 호출).
 * TrackPlayer.registerPlaybackService()는 이 함수 호출 이전에 완료되어야 함.
 */
export async function setupAudioEngine(): Promise<void> {
  await TrackPlayer.setupPlayer({
    // iOS: AVAudioSession category = playback (백그라운드 허용)
    // Android: ExoPlayer 기본 설정
  });

  await TrackPlayer.updateOptions({
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause],
    // crossfade 트리거를 위해 250ms 간격으로 progress 이벤트 수신
    progressUpdateEventInterval: 0.25,
  });

  // RNTP PlaybackState 변경을 감지해 store.isPlaying 동기화
  // (잠금화면 pause/play 버튼 → AC-07)
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    if (state === State.Playing) {
      usePlayerStore.setState({ isPlaying: true });
    } else if (state === State.Paused || state === State.Stopped || state === State.Ready) {
      usePlayerStore.setState({ isPlaying: false });
    }
  });

  // 백그라운드 전환 핸들러 등록
  AppState.addEventListener('change', async (nextState) => {
    if (nextState === 'background') {
      const { entitlement } = useAuthStore.getState();
      const { rewardedUnlockExpiresAt } = usePlayerStore.getState();
      const isRewardedActive = rewardedUnlockExpiresAt
        ? Date.now() < rewardedUnlockExpiresAt
        : false;

      const canPlayBackground =
        entitlement === 'premium' || entitlement === 'trial' || isRewardedActive;

      if (!canPlayBackground) {
        // crossfade 진행 중이면 중단 후 pause (AC-09)
        if (isCrossfading) {
          isCrossfading = false;
          currentNextSound?.unloadAsync().catch(() => {});
          currentNextSound = null;
        }
        await TrackPlayer.pause();
        usePlayerStore.setState({ pendingUpgradePrompt: 'background_blocked' });
      }
      // canPlayBackground = true → RNTP가 OS 레벨에서 백그라운드 유지 (AC-04)
    }

    if (nextState === 'active') {
      const { pendingUpgradePrompt } = usePlayerStore.getState();
      if (pendingUpgradePrompt === 'background_blocked') {
        usePlayerStore.setState({ pendingUpgradePrompt: null });
        // UpgradeSheet (variant: 'background') 노출은 S13 useEffect에서 처리 (AC-06)
      }
    }
  });

  // 앱 재실행 시 타이머 상태 복원 (isPlaying 상태일 때만)
  const { timerEndsAt, isPlaying } = usePlayerStore.getState();
  if (timerEndsAt !== null && isPlaying) {
    const remaining = timerEndsAt - Date.now();
    if (remaining > 60_000) {
      // 1분 이상 남음: 경고 + 종료 타이머 복원
      const oneMinBefore = remaining - 60_000;
      warningTimerRef = setTimeout(
        () =>
          notifyOneMinuteWarning().catch((err) =>
            console.error('[AudioEngine] notifyOneMinuteWarning (restore) failed:', err),
          ),
        oneMinBefore,
      );
      timerRef = setTimeout(
        () =>
          fadeOutAndStop('timer_expired').catch((err) =>
            console.error('[AudioEngine] fadeOutAndStop (restore) failed:', err),
          ),
        remaining,
      );
    } else if (remaining > 0) {
      // 1분 미만 남음: 즉시 경고 배너 + 종료 타이머 복원
      notifyOneMinuteWarning().catch((err) =>
        console.error('[AudioEngine] notifyOneMinuteWarning (restore <1min) failed:', err),
      );
      timerRef = setTimeout(
        () =>
          fadeOutAndStop('timer_expired').catch((err) =>
            console.error('[AudioEngine] fadeOutAndStop (restore <1min) failed:', err),
          ),
        remaining,
      );
    } else {
      // 이미 만료된 타이머: 초기화
      usePlayerStore.setState({ timerEndsAt: null });
    }
  }
}

/**
 * 재생 시작 — S13 진입 시 호출.
 * 기존 재생을 정리하고 새 트랙을 로드 + 재생한다.
 */
export async function startPlayback(params: {
  trackId: string;
  trackUrl: string; // presigned URL 또는 로컬 file:// 경로
  songKey: string;
}): Promise<void> {
  const { trackId, trackUrl, songKey } = params;

  // 1. 기존 재생 정리
  await TrackPlayer.reset();
  clearAllTimers();
  playbackStartTime = Date.now();

  // 2. RNTP에 트랙 추가
  await TrackPlayer.add({
    id: trackId,
    url: trackUrl,
    title: SONG_NAMES[songKey] ?? songKey,
    artist: '내 목소리로 만든 자장가',
    artwork: 'https://assets.jajang.app/album-art.png',
  });

  // 볼륨 복원 (이전 crossfade로 볼륨이 변경됐을 수 있음)
  const userVolume = usePlayerStore.getState().volume;
  await TrackPlayer.setVolume(userVolume);

  await TrackPlayer.play();

  // 3. Zustand 업데이트
  usePlayerStore.setState({
    currentTrackId: trackId,
    currentTrackUrl: trackUrl,
    currentSongKey: songKey,
    isPlaying: true,
  });

  // 4. 잠금화면 메타데이터 동기화
  await syncLockscreenMetadata(songKey);

  // 5. crossfade 트리거 이벤트 구독
  crossfadeListenerRef = TrackPlayer.addEventListener(
    Event.PlaybackProgressUpdated,
    ({ position, duration }) => {
      if (
        duration > 0 &&
        duration - position <= CROSSFADE_MS / 1000 + CROSSFADE_TRIGGER_OFFSET_S
      ) {
        triggerCrossfade(trackUrl).catch((err) =>
          console.error('[AudioEngine] triggerCrossfade failed:', err),
        );
      }
    },
  );

  // 6. 10시간 자동 종료 타이머 (수면 타이머 미설정 시)
  const { timerEndsAt } = usePlayerStore.getState();
  if (!timerEndsAt) {
    maxPlayTimerRef = setTimeout(
      () =>
        fadeOutAndStop('max_playtime_reached').catch((err) =>
          console.error('[AudioEngine] fadeOutAndStop failed:', err),
        ),
      MAX_PLAY_MS,
    );
  }
}

/** 재생 일시정지 */
export async function pausePlayback(): Promise<void> {
  await TrackPlayer.pause();
  usePlayerStore.setState({ isPlaying: false });
}

/** 재생 재개 */
export async function resumePlayback(): Promise<void> {
  await TrackPlayer.play();
  usePlayerStore.setState({ isPlaying: true });
}

/**
 * 재생 완전 정지 및 상태 초기화.
 * 타이머/10시간 종료 시 또는 S13 나가기 시 호출.
 */
export async function stopPlayback(): Promise<void> {
  clearAllTimers();
  playbackStartTime = null;
  if (isCrossfading) {
    isCrossfading = false;
    currentNextSound?.unloadAsync().catch(() => {});
    currentNextSound = null;
  }
  await TrackPlayer.pause();
  await TrackPlayer.reset();
  usePlayerStore.setState({
    isPlaying: false,
    currentTrackId: null,
    currentTrackUrl: null,
    currentSongKey: null,
    timerEndsAt: null,
    showTimerWarningBanner: false,
  });
}

/**
 * 볼륨 설정 (0.0 ~ 1.0).
 * crossfade 중에는 isVolumeControlLocked()가 true이므로 UI에서 호출하지 않는다 (AC-10).
 */
export async function setVolume(level: number): Promise<void> {
  const clampedLevel = Math.max(0, Math.min(1, level));
  usePlayerStore.setState({ volume: clampedLevel });
  await TrackPlayer.setVolume(clampedLevel);
}

/**
 * 수면 타이머 설정.
 * durationMs 후 10초 fade-out으로 재생 종료.
 */
export function setTimer(durationMs: number): void {
  // 기존 타이머 정리
  if (timerRef !== null) {
    clearTimeout(timerRef);
    timerRef = null;
  }
  if (warningTimerRef !== null) {
    clearTimeout(warningTimerRef);
    warningTimerRef = null;
  }
  // 수면 타이머가 설정되면 10시간 타이머를 대체
  if (maxPlayTimerRef !== null) {
    clearTimeout(maxPlayTimerRef);
    maxPlayTimerRef = null;
  }

  const endsAt = Date.now() + durationMs;
  usePlayerStore.setState({ timerEndsAt: endsAt, showTimerWarningBanner: false });

  // 1분 전 경고 타이머 예약
  const oneMinBefore = durationMs - 60_000;
  if (oneMinBefore > 0) {
    warningTimerRef = setTimeout(
      () =>
        notifyOneMinuteWarning().catch((err) =>
          console.error('[AudioEngine] notifyOneMinuteWarning failed:', err),
        ),
      oneMinBefore,
    );
  }

  timerRef = setTimeout(
    () =>
      fadeOutAndStop('timer_expired').catch((err) =>
        console.error('[AudioEngine] fadeOutAndStop (timer) failed:', err),
      ),
    durationMs,
  );
}

/** 수면 타이머 취소 */
export function clearTimer(): void {
  if (timerRef !== null) {
    clearTimeout(timerRef);
    timerRef = null;
  }
  if (warningTimerRef !== null) {
    clearTimeout(warningTimerRef);
    warningTimerRef = null;
  }
  usePlayerStore.setState({ timerEndsAt: null, showTimerWarningBanner: false });

  // 10시간 자동 종료 타이머를 잔여 시간 기준으로 재설정
  if (maxPlayTimerRef === null) {
    const elapsed = playbackStartTime !== null ? Date.now() - playbackStartTime : 0;
    const remaining = MAX_PLAY_MS - elapsed;
    if (remaining > 0) {
      maxPlayTimerRef = setTimeout(
        () =>
          fadeOutAndStop('max_playtime_reached').catch((err) =>
            console.error('[AudioEngine] fadeOutAndStop (max) failed:', err),
          ),
        remaining,
      );
    }
  }
}

/** 현재 재생 상태 조회 */
export function getIsPlaying(): boolean {
  return usePlayerStore.getState().isPlaying;
}

/**
 * 수면 타이머 잔여 시간 (ms) 조회.
 * 타이머 미설정 시 null 반환.
 */
export function getTimerRemainingMs(): number | null {
  const { timerEndsAt } = usePlayerStore.getState();
  if (timerEndsAt === null) return null;
  return Math.max(0, timerEndsAt - Date.now());
}

/**
 * crossfade 진행 중 여부 — true이면 볼륨 슬라이더 UI 비활성화 (AC-10).
 */
export function isVolumeControlLocked(): boolean {
  return isCrossfading;
}
