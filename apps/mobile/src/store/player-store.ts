import { create } from 'zustand';

interface PlayerState {
  // --- 기존 ---
  currentTrackId: string | null;
  isPlaying: boolean;
  timerEndsAt: number | null;
  rewardedUnlockExpiresAt: number | null;

  // --- Epic 04 신규 ---
  currentTrackUrl: string | null;
  currentSongKey: string | null;
  /** 재생 볼륨 0.0 ~ 1.0, 기본 0.8 */
  volume: number;
  /** 무료 유저가 백그라운드로 전환됐을 때 업그레이드 프롬프트 트리거 */
  pendingUpgradePrompt: 'background_blocked' | null;
  /** expo-notifications 권한 상태 */
  notificationPermission: 'granted' | 'denied' | 'undetermined';
  /** 타이머 1분 전 경고 배너 표시 여부 */
  showTimerWarningBanner: boolean;
}

interface PlayerActions {
  setCurrentTrack: (trackId: string | null) => void;
  setPlaying: (isPlaying: boolean) => void;
  setTimer: (endsAt: number | null) => void;
  setRewardedUnlock: (expiresAt: number | null) => void;

  // Epic 04 신규 액션
  setCurrentTrackInfo: (info: { trackId: string | null; trackUrl: string | null; songKey: string | null }) => void;
  setVolume: (volume: number) => void;
  setPendingUpgradePrompt: (prompt: 'background_blocked' | null) => void;
  setNotificationPermission: (permission: 'granted' | 'denied' | 'undetermined') => void;
  setShowTimerWarningBanner: (show: boolean) => void;
}

export const usePlayerStore = create<PlayerState & PlayerActions>()((set) => ({
  currentTrackId: null,
  isPlaying: false,
  timerEndsAt: null,
  rewardedUnlockExpiresAt: null,

  // Epic 04 초기값
  currentTrackUrl: null,
  currentSongKey: null,
  volume: 0.8,
  pendingUpgradePrompt: null,
  notificationPermission: 'undetermined',
  showTimerWarningBanner: false,

  setCurrentTrack: (trackId) => set({ currentTrackId: trackId }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTimer: (endsAt) => set({ timerEndsAt: endsAt }),
  setRewardedUnlock: (expiresAt) => set({ rewardedUnlockExpiresAt: expiresAt }),

  setCurrentTrackInfo: ({ trackId, trackUrl, songKey }) =>
    set({ currentTrackId: trackId, currentTrackUrl: trackUrl, currentSongKey: songKey }),
  setVolume: (volume) => set({ volume }),
  setPendingUpgradePrompt: (prompt) => set({ pendingUpgradePrompt: prompt }),
  setNotificationPermission: (permission) => set({ notificationPermission: permission }),
  setShowTimerWarningBanner: (show) => set({ showTimerWarningBanner: show }),
}));
