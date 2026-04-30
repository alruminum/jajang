/**
 * REQ-USE-AUTH: useAuth 훅 동작 검증
 * 대상 파일: src/hooks/useAuth.ts
 * - saveSession: SecureStore 토큰 저장 + auth-store 상태 업데이트
 * - logout: SecureStore 토큰 삭제 + auth-store clearAuth 호출
 */

const mockSetAuth = jest.fn();
const mockClearAuth = jest.fn();

jest.mock('@store/auth-store', () => ({
  __esModule: true,
  useAuthStore: jest.fn(() => ({
    setAuth: mockSetAuth,
    clearAuth: mockClearAuth,
  })),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@hooks/useAuth';
import type { AuthResponse } from '@services/auth-api';

const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

const MOCK_RESPONSE: AuthResponse = {
  access_token: 'access-token-123',
  refresh_token: 'refresh-token-456',
  token_type: 'Bearer',
  entitlement: 'free',
  user_id: 'user-001',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── saveSession ──────────────────────────────────────────────────────────────
describe('REQ-USE-AUTH: saveSession', () => {
  it('access_token을 SecureStore에 저장한다', async () => {
    const { saveSession } = useAuth();
    await saveSession(MOCK_RESPONSE);
    expect(setItemAsync).toHaveBeenCalledWith('access_token', 'access-token-123');
  });

  it('refresh_token을 SecureStore에 저장한다', async () => {
    const { saveSession } = useAuth();
    await saveSession(MOCK_RESPONSE);
    expect(setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh-token-456');
  });

  it('setAuth를 userId, accessToken, entitlement로 호출한다', async () => {
    const { saveSession } = useAuth();
    await saveSession(MOCK_RESPONSE);
    expect(mockSetAuth).toHaveBeenCalledWith({
      userId: 'user-001',
      accessToken: 'access-token-123',
      entitlement: 'free',
    });
  });

  it('entitlement가 trial인 AuthResponse → setAuth에 trial 전달', async () => {
    const { saveSession } = useAuth();
    await saveSession({ ...MOCK_RESPONSE, entitlement: 'trial' });
    expect(mockSetAuth).toHaveBeenCalledWith(
      expect.objectContaining({ entitlement: 'trial' }),
    );
  });

  it('entitlement가 premium인 AuthResponse → setAuth에 premium 전달', async () => {
    const { saveSession } = useAuth();
    await saveSession({ ...MOCK_RESPONSE, entitlement: 'premium' });
    expect(mockSetAuth).toHaveBeenCalledWith(
      expect.objectContaining({ entitlement: 'premium' }),
    );
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────
describe('REQ-USE-AUTH: logout', () => {
  it('access_token을 SecureStore에서 삭제한다', async () => {
    const { logout } = useAuth();
    await logout();
    expect(deleteItemAsync).toHaveBeenCalledWith('access_token');
  });

  it('refresh_token을 SecureStore에서 삭제한다', async () => {
    const { logout } = useAuth();
    await logout();
    expect(deleteItemAsync).toHaveBeenCalledWith('refresh_token');
  });

  it('clearAuth를 호출하여 스토어 상태를 초기화한다', async () => {
    const { logout } = useAuth();
    await logout();
    expect(mockClearAuth).toHaveBeenCalledTimes(1);
  });
});
