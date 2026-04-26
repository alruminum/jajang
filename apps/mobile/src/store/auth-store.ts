import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthState {
  userId: string | null;
  accessToken: string | null;        // SecureStore에 저장 (민감), 여기서는 캐시 용도
  entitlement: 'free' | 'trial' | 'premium' | null;
  trialExpiresAt: string | null;     // ISO 8601
  isAuthenticated: boolean;
}

interface AuthActions {
  setAuth: (payload: {
    userId: string;
    accessToken: string;
    entitlement: 'free' | 'trial' | 'premium';
    trialExpiresAt?: string | null;
  }) => void;
  setEntitlement: (entitlement: 'free' | 'trial' | 'premium', trialExpiresAt?: string | null) => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  userId: null,
  accessToken: null,
  entitlement: null,
  trialExpiresAt: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      setAuth: ({ userId, accessToken, entitlement, trialExpiresAt = null }) =>
        set({
          userId,
          accessToken,   // 주의: 민감 데이터. persist에 포함되나 AsyncStorage는 로컬 전용
          entitlement,
          trialExpiresAt,
          isAuthenticated: true,
        }),

      setEntitlement: (entitlement, trialExpiresAt = null) =>
        set({ entitlement, trialExpiresAt }),

      clearAuth: () => set(initialState),
    }),
    {
      name: 'jajang-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // accessToken은 persist에서 제외 — SecureStore 별도 저장
      // 앱 재시작 시 SecureStore에서 재검증 필수
      partialize: (state) => ({
        userId: state.userId,
        entitlement: state.entitlement,
        trialExpiresAt: state.trialExpiresAt,
        isAuthenticated: state.isAuthenticated,
        // accessToken은 의도적으로 제외 — SecureStore에서 관리
      }),
    },
  ),
);
