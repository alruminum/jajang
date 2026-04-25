import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@store/auth-store';
import { AuthResponse } from '@services/auth-api';

export function useAuth() {
  const { setAuth, clearAuth, setEntitlement } = useAuthStore();

  const saveSession = async (authResponse: AuthResponse) => {
    // 토큰 원본: SecureStore
    await SecureStore.setItemAsync('access_token', authResponse.access_token);
    await SecureStore.setItemAsync('refresh_token', authResponse.refresh_token);

    // 상태 캐시: Zustand
    setAuth({
      userId: authResponse.user_id,
      accessToken: authResponse.access_token,
      entitlement: authResponse.entitlement,
    });
    // impl/07에서 RevenueCat logIn 호출 + trialExpiresAt 업데이트
  };

  const clearStoredTokens = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    clearAuth();
  };

  /**
   * 세션 만료 처리 — API 인터셉터 refresh 실패 시 호출
   * 로그인 화면으로 리다이렉트 (음원 데이터 유지 — clearAuth만, 캐시 미삭제)
   */
  const handleSessionExpired = async () => {
    await clearStoredTokens();
    // 네비게이션은 App.tsx SessionExpiredListener에서 처리
  };

  const logout = async () => {
    await clearStoredTokens();
    // 계정 탈퇴 시 (S16): clearConsentFlag() 추가 호출
  };

  return { saveSession, logout, handleSessionExpired, setEntitlement };
}
