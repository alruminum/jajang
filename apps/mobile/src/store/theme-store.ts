import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePref = 'system' | 'dark' | 'light';

interface ThemeState {
  pref: ThemePref;
}

interface ThemeActions {
  setPref: (p: ThemePref) => void;
}

export const useThemeStore = create<ThemeState & ThemeActions>()(
  persist(
    (set) => ({
      pref: 'system',          // 초기값: OS 추종
      setPref: (p) => set({ pref: p }),
    }),
    {
      name: 'jajang.themePref',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
