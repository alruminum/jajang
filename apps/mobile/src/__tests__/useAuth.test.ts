/**
 * useAuth 훅 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/06-app-session-state.md §5
 *
 * 수용 기준 커버:
 * - REQ-SESSION-01: 로그인 성공 후 세션 저장 (saveSession)
 * - REQ-SESSION-05: 인터셉터 refresh 실패 → handleSessionExpired
 * - REQ-SESSION-03: 로그아웃 (logout)
 * - REQ-SESSION-07: entitlement 값 검증 ('free'/'trial'/'premium')
 */

import { renderHook, act } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSetAuth = jest.fn();
const mockClearAuth = jest.fn();
const mockSetEntitlement = jest.fn();

jest.mock('@store/auth-store', () => ({
  useAuthStore: () => ({
    setAuth: mockSetAuth,
    clearAuth: mockClearAuth,
    setEntitlement: mockSetEntitlement,
  }),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

jest.mock('@hooks/useConsentFlag', () => ({
  clearConsentFlag: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({ reset: jest.fn() })),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@navigation/types', () => ({}));

// ─── 임포트 (mock 선언 이후) ──────────────────────────────────────────────────

import { useAuth } from '@hooks/useAuth';
import * as SecureStore from 'expo-secure-store';

// ─── 픽스처 ───────────────────────────────────────────────────────────────────

const mockAuthResponse = {
  user_id: 'user-123',
  access_token: 'access-abc',
  refresh_token: 'refresh-xyz',
  entitlement: 'free' as const,
};

// ─── 테스트 ───────────────────────────────────────────────────────────────────

describe('useAuth (REQ-SESSION)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── REQ-SESSION-01: saveSession ───────────────────────────────────────────
  describe('REQ-SESSION-01: saveSession — 세션 저장', () => {
    it('access_token을 SecureStore에 저장한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.saveSession(mockAuthResponse);
      });

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'access-abc');
    });

    it('refresh_token을 SecureStore에 저장한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.saveSession(mockAuthResponse);
      });

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'refresh-xyz');
    });

    it('Zustand setAuth를 userId·accessToken·entitlement와 함께 호출한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.saveSession(mockAuthResponse);
      });

      expect(mockSetAuth).toHaveBeenCalledWith({
        userId: 'user-123',
        accessToken: 'access-abc',
        entitlement: 'free',
      });
    });

    // REQ-SESSION-07: entitlement 경계값
    it("entitlement 'trial'이 setAuth에 올바르게 전달된다", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.saveSession({ ...mockAuthResponse, entitlement: 'trial' });
      });

      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ entitlement: 'trial' }),
      );
    });

    it("entitlement 'premium'이 setAuth에 올바르게 전달된다", async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.saveSession({ ...mockAuthResponse, entitlement: 'premium' });
      });

      expect(mockSetAuth).toHaveBeenCalledWith(
        expect.objectContaining({ entitlement: 'premium' }),
      );
    });
  });

  // ─── REQ-SESSION-05: handleSessionExpired ──────────────────────────────────
  describe('REQ-SESSION-05: handleSessionExpired — 세션 만료 처리', () => {
    it('access_token을 SecureStore에서 삭제한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.handleSessionExpired();
      });

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    });

    it('refresh_token을 SecureStore에서 삭제한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.handleSessionExpired();
      });

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    });

    it('Zustand clearAuth를 호출하여 상태를 초기화한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.handleSessionExpired();
      });

      expect(mockClearAuth).toHaveBeenCalledTimes(1);
    });

    it('SecureStore 삭제 완료 후 clearAuth가 호출된다 (순서 보장)', async () => {
      const callOrder: string[] = [];
      (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(
        async (key: string) => { callOrder.push(`delete:${key}`); },
      );
      mockClearAuth.mockImplementation(() => { callOrder.push('clearAuth'); });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.handleSessionExpired();
      });

      const clearAuthIdx = callOrder.indexOf('clearAuth');
      const deleteAccessIdx = callOrder.indexOf('delete:access_token');
      const deleteRefreshIdx = callOrder.indexOf('delete:refresh_token');

      expect(deleteAccessIdx).toBeGreaterThanOrEqual(0);
      expect(deleteRefreshIdx).toBeGreaterThanOrEqual(0);
      expect(clearAuthIdx).toBeGreaterThan(Math.max(deleteAccessIdx, deleteRefreshIdx));
    });
  });

  // ─── REQ-SESSION-03: logout ────────────────────────────────────────────────
  describe('REQ-SESSION-03: logout', () => {
    it('access_token을 SecureStore에서 삭제한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.logout();
      });

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
    });

    it('refresh_token을 SecureStore에서 삭제한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.logout();
      });

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
    });

    it('Zustand clearAuth를 호출한다', async () => {
      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockClearAuth).toHaveBeenCalledTimes(1);
    });
  });

  // ─── REQ-SESSION-07: setEntitlement 위임 ───────────────────────────────────
  describe('REQ-SESSION-07: setEntitlement — store로 위임', () => {
    it('반환된 setEntitlement는 store의 setEntitlement와 동일한 참조이다', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.setEntitlement).toBe(mockSetEntitlement);
    });
  });
});
