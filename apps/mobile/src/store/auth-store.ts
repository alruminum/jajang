// STUB — impl/06에서 완전 구현 예정
// useAuth.ts 컴파일을 위한 최소 인터페이스 제공
import { create } from 'zustand';

interface AuthState {
  userId: string | null;
  accessToken: string | null;
  entitlement: 'free' | 'trial' | 'premium' | null;
  setAuth: (payload: {
    userId: string;
    accessToken: string;
    entitlement: 'free' | 'trial' | 'premium';
  }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  accessToken: null,
  entitlement: null,
  setAuth: (payload) =>
    set({
      userId: payload.userId,
      accessToken: payload.accessToken,
      entitlement: payload.entitlement,
    }),
  clearAuth: () =>
    set({
      userId: null,
      accessToken: null,
      entitlement: null,
    }),
}));
