import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@store/auth-store'; // impl/06에서 완전 구현
import { AuthResponse } from '@services/auth-api';

export function useAuth() {
  const { setAuth, clearAuth } = useAuthStore();

  const saveSession = async (authResponse: AuthResponse) => {
    await SecureStore.setItemAsync('access_token', authResponse.access_token);
    await SecureStore.setItemAsync('refresh_token', authResponse.refresh_token);
    setAuth({
      userId: authResponse.user_id,
      accessToken: authResponse.access_token,
      entitlement: authResponse.entitlement,
    });
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    clearAuth();
  };

  return { saveSession, logout };
}
