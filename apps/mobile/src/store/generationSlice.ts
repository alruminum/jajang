// apps/mobile/src/store/generationSlice.ts
// 생성 상태 Zustand slice (persist: 앱 재시작 후 activeJobId 복원)

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface GenerationState {
  // 현재 진행 중인 job
  activeJobId:    string | null
  activeTrackId:  string | null
  activeSongKey:  string | null

  // 완료된 job 결과 (S12 → S13 이동 또는 홈 복귀 후 카드 표시)
  completedJobId:      string | null
  completedTrackId:    string | null
  completedPresignUrl: string | null

  // 액션
  setActiveJob:    (jobId: string, trackId: string, songKey: string) => void
  setCompleted:    (jobId: string, trackId: string, presignUrl: string) => void
  clearActive:     () => void
  clearCompleted:  () => void
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set) => ({
      activeJobId:    null,
      activeTrackId:  null,
      activeSongKey:  null,
      completedJobId:      null,
      completedTrackId:    null,
      completedPresignUrl: null,

      setActiveJob: (jobId, trackId, songKey) =>
        set({ activeJobId: jobId, activeTrackId: trackId, activeSongKey: songKey }),

      setCompleted: (jobId, trackId, presignUrl) =>
        set({
          activeJobId: null, activeTrackId: null, activeSongKey: null,
          completedJobId: jobId, completedTrackId: trackId, completedPresignUrl: presignUrl,
        }),

      clearActive:    () => set({ activeJobId: null, activeTrackId: null, activeSongKey: null }),
      clearCompleted: () => set({ completedJobId: null, completedTrackId: null, completedPresignUrl: null }),
    }),
    {
      name: 'jajang-generation',
      storage: createJSONStorage(() => AsyncStorage),
      // persist 이유: 앱 재시작 후에도 activeJobId 복원 → 홈에서 has_pending 카드 표시
    },
  ),
)
