import { create } from 'zustand';

// Epic 04에서 실제 로직으로 채울 것
interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  timerEndsAt: number | null;
  rewardedUnlockExpiresAt: number | null;
}

interface PlayerActions {
  setCurrentTrack: (trackId: string | null) => void;
  setPlaying: (isPlaying: boolean) => void;
  setTimer: (endsAt: number | null) => void;
  setRewardedUnlock: (expiresAt: number | null) => void;
}

export const usePlayerStore = create<PlayerState & PlayerActions>()((set) => ({
  currentTrackId: null,
  isPlaying: false,
  timerEndsAt: null,
  rewardedUnlockExpiresAt: null,

  setCurrentTrack: (trackId) => set({ currentTrackId: trackId }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setTimer: (endsAt) => set({ timerEndsAt: endsAt }),
  setRewardedUnlock: (expiresAt) => set({ rewardedUnlockExpiresAt: expiresAt }),
}));
