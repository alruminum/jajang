/**
 * useEntitlement.ts 훅 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/07-app-trial-activation.md
 * 수용 기준: §8 수용 기준 + §3 핵심 로직 (포그라운드 동기화, 실시간 리스너)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('@store/auth-store', () => ({
  useAuthStore: vi.fn(() => ({
    setEntitlement: vi.fn(),
    isAuthenticated: true,
    entitlement: 'trial',
    trialExpiresAt: null,
  })),
}));

vi.mock('@services/revenue-cat', () => ({
  getCustomerInfo: vi.fn(),
  extractEntitlement: vi.fn(),
  addCustomerInfoListener: vi.fn(() => vi.fn()),
}));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────
import { AppState } from 'react-native';
import { useAuthStore } from '@store/auth-store';
import * as revenueCatService from '@services/revenue-cat';
import { useEntitlementSync, useTrialDaysRemaining } from '@hooks/useEntitlement';

// ─── Helper: useAuthStore 반환값 설정 ─────────────────────────────────────────
function mockAuthStore(overrides: {
  isAuthenticated?: boolean;
  entitlement?: 'free' | 'trial' | 'premium';
  trialExpiresAt?: string | null;
  setEntitlement?: ReturnType<typeof vi.fn>;
}) {
  const setEntitlement = overrides.setEntitlement ?? vi.fn();
  vi.mocked(useAuthStore).mockReturnValue({
    setEntitlement,
    isAuthenticated: overrides.isAuthenticated ?? true,
    entitlement: overrides.entitlement ?? 'trial',
    trialExpiresAt: overrides.trialExpiresAt ?? null,
  } as any);
  return { setEntitlement };
}

// ─── Helper: AppState change 핸들러 캡처 ─────────────────────────────────────
function captureAppStateHandler(): ((state: string) => void) | undefined {
  const calls = vi.mocked(AppState.addEventListener).mock.calls;
  const changeCall = calls.find(([event]) => event === 'change');
  return changeCall?.[1] as ((state: string) => void) | undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('REQ-useEntitlement: useEntitlement 훅', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(revenueCatService.addCustomerInfoListener).mockReturnValue(vi.fn());
  });

  // ─── useTrialDaysRemaining ──────────────────────────────────────────────────
  describe('useTrialDaysRemaining — 수용 기준: D-1 배너 표시용 잔여일 계산', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('entitlement !== trial이면 null을 반환한다', () => {
      mockAuthStore({ entitlement: 'free', trialExpiresAt: null });

      const { result } = renderHook(() => useTrialDaysRemaining());

      expect(result.current).toBeNull();
    });

    it('trialExpiresAt이 null이면 null을 반환한다', () => {
      mockAuthStore({ entitlement: 'trial', trialExpiresAt: null });

      const { result } = renderHook(() => useTrialDaysRemaining());

      expect(result.current).toBeNull();
    });

    it('이미 만료된 날짜면 0을 반환한다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-02-10T12:00:00Z'));
      mockAuthStore({
        entitlement: 'trial',
        trialExpiresAt: '2024-02-09T00:00:00Z', // 어제 만료
      });

      const { result } = renderHook(() => useTrialDaysRemaining());

      expect(result.current).toBe(0);
    });

    it('정확히 1일(24시간) 남았으면 1을 반환한다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-02-07T00:00:00Z'));
      mockAuthStore({
        entitlement: 'trial',
        trialExpiresAt: '2024-02-08T00:00:00Z',
      });

      const { result } = renderHook(() => useTrialDaysRemaining());

      expect(result.current).toBe(1);
    });

    it('0.5일(12시간) 남았으면 Math.ceil로 1을 반환한다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-02-07T12:00:00Z'));
      mockAuthStore({
        entitlement: 'trial',
        trialExpiresAt: '2024-02-08T00:00:00Z', // 12시간 남음
      });

      const { result } = renderHook(() => useTrialDaysRemaining());

      expect(result.current).toBe(1); // Math.ceil(0.5) = 1
    });
  });

  // ─── useEntitlementSync ─────────────────────────────────────────────────────
  describe('useEntitlementSync — 수용 기준: 포그라운드 복귀 & 실시간 동기화', () => {
    it('isAuthenticated false이면 AppState active 이벤트에도 getCustomerInfo를 호출하지 않는다', async () => {
      mockAuthStore({ isAuthenticated: false });

      renderHook(() => useEntitlementSync());

      const handler = captureAppStateHandler();
      await act(async () => {
        handler?.('active');
      });

      expect(revenueCatService.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('AppState active 이벤트 → getCustomerInfo 호출 후 setEntitlement가 실행된다', async () => {
      const fakeInfo = {};
      const { setEntitlement } = mockAuthStore({ isAuthenticated: true });
      vi.mocked(revenueCatService.getCustomerInfo).mockResolvedValue(fakeInfo as any);
      vi.mocked(revenueCatService.extractEntitlement).mockReturnValue({
        entitlement: 'trial',
        trialExpiresAt: '2024-02-07T00:00:00Z',
      });

      renderHook(() => useEntitlementSync());

      const handler = captureAppStateHandler();
      await act(async () => {
        handler?.('active');
      });

      expect(revenueCatService.getCustomerInfo).toHaveBeenCalledTimes(1);
      expect(setEntitlement).toHaveBeenCalledWith('trial', '2024-02-07T00:00:00Z');
    });

    it('AppState background 이벤트는 getCustomerInfo를 호출하지 않는다', async () => {
      mockAuthStore({ isAuthenticated: true });

      renderHook(() => useEntitlementSync());

      const handler = captureAppStateHandler();
      await act(async () => {
        handler?.('background');
      });

      expect(revenueCatService.getCustomerInfo).not.toHaveBeenCalled();
    });

    it('getCustomerInfo 실패 시 에러를 흡수하고 throw하지 않는다', async () => {
      mockAuthStore({ isAuthenticated: true });
      vi.mocked(revenueCatService.getCustomerInfo).mockRejectedValue(
        new Error('RevenueCat 네트워크 오류'),
      );

      renderHook(() => useEntitlementSync());

      const handler = captureAppStateHandler();
      await expect(
        act(async () => {
          handler?.('active');
        }),
      ).resolves.not.toThrow();
    });

    it('isAuthenticated false이면 addCustomerInfoListener를 등록하지 않는다', () => {
      mockAuthStore({ isAuthenticated: false });

      renderHook(() => useEntitlementSync());

      expect(revenueCatService.addCustomerInfoListener).not.toHaveBeenCalled();
    });

    it('isAuthenticated true이면 addCustomerInfoListener를 등록한다', () => {
      mockAuthStore({ isAuthenticated: true });

      renderHook(() => useEntitlementSync());

      expect(revenueCatService.addCustomerInfoListener).toHaveBeenCalledTimes(1);
    });

    it('unmount 시 AppState subscription이 제거된다', () => {
      mockAuthStore({ isAuthenticated: true });
      const mockRemove = vi.fn();
      vi.mocked(AppState.addEventListener).mockReturnValue({ remove: mockRemove } as any);

      const { unmount } = renderHook(() => useEntitlementSync());
      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });

    it('CustomerInfo 리스너 콜백 호출 시 setEntitlement가 업데이트된다', async () => {
      const { setEntitlement } = mockAuthStore({ isAuthenticated: true });
      let capturedCallback: ((info: any) => void) | undefined;
      vi.mocked(revenueCatService.addCustomerInfoListener).mockImplementation((cb) => {
        capturedCallback = cb;
        return vi.fn();
      });
      vi.mocked(revenueCatService.extractEntitlement).mockReturnValue({
        entitlement: 'premium',
        trialExpiresAt: null,
      });

      renderHook(() => useEntitlementSync());

      await act(async () => {
        capturedCallback?.({} as any);
      });

      expect(setEntitlement).toHaveBeenCalledWith('premium', null);
    });
  });
});
