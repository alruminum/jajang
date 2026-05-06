// apps/mobile/src/store/generationSlice.ts
// 생성 상태 Zustand store
//
// impl/07 — sessions API 기반 sessionId / pollState / isRetrying 추가
// 기존 Epic 06 API (tracks / removeTrack / clearAllTracks) 유지 (호환성)

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from '../services/dataManagementApi';
import type { PollState } from '../hooks/useSessionPolling';

type GenerationState = {
  // ── impl/07 (sessions API 기반) ──────────────────────────────────────────
  sessionId: string | null;
  pollState: PollState | null;
  isRetrying: boolean;

  setSessionId: (sessionId: string | null) => void;
  setPollState: (pollState: PollState | null) => void;
  setRetrying: (isRetrying: boolean) => void;
  reset: () => void;

  // ── Epic 06 호환 (tracks 관리 — DeleteTracksSheet / AccountDeletionScreen) ──
  tracks: Track[];

  removeTrack: (trackId: string) => void;
  clearAllTracks: () => void;
};

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set) => ({
      // impl/07 state
      sessionId: null,
      pollState: null,
      isRetrying: false,

      setSessionId: (sessionId) => set({ sessionId }),
      setPollState: (pollState) => set({ pollState }),
      setRetrying: (isRetrying) => set({ isRetrying }),
      reset: () => set({ sessionId: null, pollState: null, isRetrying: false }),

      // Epic 06 호환
      tracks: [],

      removeTrack: (trackId) =>
        set((state) => ({
          tracks: state.tracks.filter((t) => t.id !== trackId),
        })),

      clearAllTracks: () => set({ tracks: [] }),
    }),
    {
      name: 'jajang-generation',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
