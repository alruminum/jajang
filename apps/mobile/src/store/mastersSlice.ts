// apps/mobile/src/store/mastersSlice.ts
// MasterAudio 목록 Zustand 스토어 (impl/05)

import { create } from 'zustand';
import { mastersApi, MasterItem } from '../services/api/masters';

type MastersState = {
  items: MasterItem[];
  hasPending: boolean;
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
};

type MastersActions = {
  loadMasters: () => Promise<void>;
  loadMore: () => Promise<void>;
};

export const useMastersStore = create<MastersState & MastersActions>((set, get) => ({
  items: [],
  hasPending: false,
  nextCursor: null,
  isLoading: false,
  error: null,

  loadMasters: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await mastersApi.fetchMastersMe();
      set({
        items: data.items,
        hasPending: data.has_pending,
        nextCursor: data.next_cursor,
        isLoading: false,
      });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'unknown error' });
    }
  },

  loadMore: async () => {
    const { nextCursor, isLoading, items } = get();
    if (!nextCursor || isLoading) return;
    set({ isLoading: true });
    try {
      const data = await mastersApi.fetchMastersMe(nextCursor);
      set({
        items: [...items, ...data.items],
        hasPending: data.has_pending,
        nextCursor: data.next_cursor,
        isLoading: false,
      });
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'unknown error' });
    }
  },
}));
