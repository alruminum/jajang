/**
 * S01SplashScreen 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/06-app-session-state.md §7
 *
 * 수용 기준 커버:
 * - REQ-SPLASH-01: consent 미동의 → Auth 이동
 * - REQ-SPLASH-02: 유효한 access_token → Main 자동 진입
 * - REQ-SPLASH-03: access_token 만료 + refresh_token 유효 → 자동 갱신 → Main
 * - REQ-SPLASH-04: refresh_token 만료 → clearAuth → Auth 이동
 * - REQ-SPLASH-05: 토큰 없음(로그아웃 상태) → clearAuth → Auth 이동
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigationReplace = vi.fn();

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockNavigationReplace }),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));

const mockClearAuth = vi.fn();
vi.mock('@store/auth-store', () => ({
  useAuthStore: () => ({
    isAuthenticated: false,
    clearAuth: mockClearAuth,
  }),
}));

vi.mock('@services/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

// jwt-decode mock — isTokenValid 내부의 JWT 검증 제어
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(),
}));

// ─── 임포트 (mock 선언 이후) ──────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { api } from '@services/api';
import { jwtDecode } from 'jwt-decode';
import S01SplashScreen from '@screens/S01SplashScreen';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const SPLASH_DELAY_MS = 1500;

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 만료되지 않은 JWT payload를 반환하도록 jwtDecode 설정 */
function mockValidToken() {
  (jwtDecode as ReturnType<typeof vi.fn>).mockReturnValue({
    exp: Math.floor(Date.now() / 1000) + 3600, // 1시간 후 만료
  });
}

/** 이미 만료된 JWT payload를 반환하도록 jwtDecode 설정 */
function mockExpiredToken() {
  (jwtDecode as ReturnType<typeof vi.fn>).mockReturnValue({
    exp: Math.floor(Date.now() / 1000) - 3600, // 1시간 전 만료
  });
}

// ─── 테스트 ───────────────────────────────────────────────────────────────────

describe('S01SplashScreen (REQ-SPLASH)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── REQ-SPLASH-01: consent 미동의 ─────────────────────────────────────────
  describe('REQ-SPLASH-01: consent 미동의 → Auth 이동', () => {
    it(`consent_given이 null이면 ${SPLASH_DELAY_MS}ms 후 Auth로 이동한다`, async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');
      });
    });

    it("consent_given이 'false'이면 Auth로 이동한다", async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('false');

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');
      });
    });

    it('consent 미동의 시 SecureStore를 조회하지 않는다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
      });
    });
  });

  // ─── REQ-SPLASH-02: 유효한 access_token → Main ─────────────────────────────
  describe('REQ-SPLASH-02: 유효한 access_token → Main 자동 진입', () => {
    it('consent 동의 + 유효한 access_token → Main으로 이동한다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => Promise.resolve(key === 'access_token' ? 'valid.jwt.token' : null),
      );
      mockValidToken();

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockNavigationReplace).toHaveBeenCalledWith('Main');
      });
    });

    it('유효한 access_token 시 refresh API를 호출하지 않는다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => Promise.resolve(key === 'access_token' ? 'valid.jwt.token' : null),
      );
      mockValidToken();

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(api.post).not.toHaveBeenCalled();
      });
    });
  });

  // ─── REQ-SPLASH-03: access_token 만료 + refresh 유효 → 갱신 후 Main ─────────
  describe('REQ-SPLASH-03: access_token 만료 + refresh_token 유효 → 갱신 후 Main', () => {
    beforeEach(() => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => {
          if (key === 'access_token') return Promise.resolve('expired.jwt.token');
          if (key === 'refresh_token') return Promise.resolve('valid.refresh.token');
          return Promise.resolve(null);
        },
      );
      mockExpiredToken();
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: {
          access_token: 'new.access.token',
          refresh_token: 'new.refresh.token',
        },
      });
    });

    it('refresh API를 올바른 payload로 호출한다', async () => {
      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/refresh', {
          refresh_token: 'valid.refresh.token',
        });
      });
    });

    it('refresh 성공 후 Main으로 이동한다', async () => {
      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockNavigationReplace).toHaveBeenCalledWith('Main');
      });
    });

    it('새 access_token을 SecureStore에 저장한다', async () => {
      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
          'access_token',
          'new.access.token',
        );
      });
    });

    it('새 refresh_token을 SecureStore에 저장한다', async () => {
      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
          'refresh_token',
          'new.refresh.token',
        );
      });
    });
  });

  // ─── REQ-SPLASH-04: refresh_token 만료 → clearAuth + Auth ──────────────────
  describe('REQ-SPLASH-04: refresh_token 만료(30일 경과) → clearAuth + Auth 이동', () => {
    it('refresh API 실패 시 clearAuth 호출 후 Auth로 이동한다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => {
          if (key === 'access_token') return Promise.resolve('expired.jwt.token');
          if (key === 'refresh_token') return Promise.resolve('expired.refresh.token');
          return Promise.resolve(null);
        },
      );
      mockExpiredToken();
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('401 Unauthorized'), { response: { status: 401 } }),
      );

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockClearAuth).toHaveBeenCalledTimes(1);
        expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');
      });
    });

    it('refresh 실패 시 Main으로 이동하지 않는다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockImplementation(
        (key: string) => {
          if (key === 'access_token') return Promise.resolve('expired.jwt.token');
          if (key === 'refresh_token') return Promise.resolve('expired.refresh.token');
          return Promise.resolve(null);
        },
      );
      mockExpiredToken();
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network Error'));

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockNavigationReplace).not.toHaveBeenCalledWith('Main');
      });
    });
  });

  // ─── REQ-SPLASH-05: 토큰 없음(미로그인) → clearAuth + Auth ─────────────────
  describe('REQ-SPLASH-05: 토큰 없음(로그아웃 상태) → clearAuth + Auth 이동', () => {
    it('consent 동의 + access/refresh 모두 없음 → clearAuth 후 Auth로 이동한다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(mockClearAuth).toHaveBeenCalledTimes(1);
        expect(mockNavigationReplace).toHaveBeenCalledWith('Auth');
      });
    });

    it('토큰 없을 때 refresh API를 호출하지 않는다', async () => {
      (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('true');
      (SecureStore.getItemAsync as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      render(<S01SplashScreen />);
      await vi.advanceTimersByTimeAsync(SPLASH_DELAY_MS);

      await waitFor(() => {
        expect(api.post).not.toHaveBeenCalled();
      });
    });
  });
});
