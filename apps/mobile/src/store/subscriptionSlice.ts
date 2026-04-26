/**
 * SubscriptionSlice — 구독/광고 상태 Zustand 스토어
 *
 * 커버: Rewarded Ad 월 사용 횟수, 언락 만료 시각, 생성 횟수
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/06-app-upgrade-sheet-A.md
 *
 * 주의:
 * - rewardedUnlockExpiresAt은 UI용. AudioEngine이 읽는 진실 공급원은 PlayerSlice.
 * - 동기화 책임은 S14 handleRewardedAd에 있음.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

export function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface SubscriptionState {
  /** 누적 트랙 생성 횟수 */
  generationCount: number;
  /** 이번 달 Rewarded Ad 시청 횟수 (0~7) */
  rewardedAdUsedThisMonth: number;
  /** 'YYYY-MM' — 월 전환 시 카운터 리셋 기준 */
  rewardedAdMonthKey: string;
  /** 오늘 자정 timestamp (UI용). AudioEngine 진실 공급원은 PlayerSlice. */
  rewardedUnlockExpiresAt: number | null;
}

interface SubscriptionActions {
  setGenerationCount: (count: number) => void;
  incrementRewardedAdUsage: () => void;
  resetMonthlyRewardedAd: (monthKey: string) => void;
  setRewardedUnlockExpiresAt: (expiresAt: number | null) => void;
}

// ─── 스토어 ────────────────────────────────────────────────────────────────────

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>()(
  persist(
    (set) => ({
      generationCount: 0,
      rewardedAdUsedThisMonth: 0,
      rewardedAdMonthKey: getCurrentMonthKey(),
      rewardedUnlockExpiresAt: null,

      setGenerationCount: (count) => set({ generationCount: count }),

      incrementRewardedAdUsage: () =>
        set((state) => ({
          rewardedAdUsedThisMonth: state.rewardedAdUsedThisMonth + 1,
        })),

      resetMonthlyRewardedAd: (monthKey) =>
        set({ rewardedAdUsedThisMonth: 0, rewardedAdMonthKey: monthKey }),

      setRewardedUnlockExpiresAt: (expiresAt) =>
        set({ rewardedUnlockExpiresAt: expiresAt }),
    }),
    {
      name: 'jajang-subscription',
      storage: createJSONStorage(() => AsyncStorage),
      // persist 이유: 월 카운터가 앱 재시작 후에도 유지되어야 함
    },
  ),
);
