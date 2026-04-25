/**
 * revenue-cat.ts 서비스 테스트
 * impl: docs/milestones/v1/epics/epic-01-auth/impl/07-app-trial-activation.md
 * 수용 기준: §8 수용 기준
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── __DEV__ 전역 (모듈 최상단 if (__DEV__) 분기 대비) ────────────────────────
vi.hoisted(() => {
  Object.defineProperty(globalThis, '__DEV__', {
    value: false,
    writable: true,
    configurable: true,
  });
});

// ─── Mocks (vi.mock은 vitest가 imports 위로 hoist) ───────────────────────────
vi.mock('react-native-purchases', () => ({
  default: {
    configure: vi.fn(),
    logIn: vi.fn(),
    logOut: vi.fn(),
    getCustomerInfo: vi.fn(),
    setLogLevel: vi.fn(),
    addCustomerInfoUpdateListener: vi.fn(),
    removeCustomerInfoUpdateListener: vi.fn(),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG' },
}));

vi.mock('react-native', () => ({
  Platform: {
    select: vi.fn(
      (options: Record<string, string | undefined>) =>
        options.ios ?? options.default ?? '',
    ),
  },
}));

vi.mock('@store/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import Purchases from 'react-native-purchases';
import {
  configurePurchases,
  revenueCatLogin,
  extractEntitlement,
  getCustomerInfo,
  revenueCatLogout,
  addCustomerInfoListener,
} from '@services/revenue-cat';

// ─── Helper: CustomerInfo mock 생성 ──────────────────────────────────────────
function makeCustomerInfo(options?: {
  hasPremiumEntitlement?: boolean;
  periodType?: 'TRIAL' | 'INTRO' | 'NORMAL';
  expirationDate?: string | null;
}): any {
  const {
    hasPremiumEntitlement = false,
    periodType = 'NORMAL',
    expirationDate = null,
  } = options ?? {};

  const active: Record<string, object> = {};
  if (hasPremiumEntitlement) {
    active['premium'] = {
      periodType,
      expirationDate,
      identifier: 'premium',
      productIdentifier: 'monthly_premium',
      isActive: true,
      isSandbox: false,
    };
  }

  return {
    entitlements: { active, all: active },
    activeSubscriptions: [],
    allPurchasedProductIdentifiers: [],
    latestExpirationDate: null,
    firstSeen: '2024-01-01T00:00:00Z',
    originalAppUserId: 'test-user',
    requestDate: '2024-01-01T00:00:00Z',
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('REQ-revenue-cat: revenue-cat 서비스', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REVENUECAT_IOS_API_KEY = 'ios-test-key';
    process.env.REVENUECAT_ANDROID_API_KEY = 'android-test-key';
  });

  // ─── extractEntitlement (pure function) ────────────────────────────────────
  describe('extractEntitlement — 수용 기준: entitlement 타입 변환', () => {
    it('active premium entitlement 없으면 free와 trialExpiresAt:null을 반환한다', () => {
      const info = makeCustomerInfo({ hasPremiumEntitlement: false });

      expect(extractEntitlement(info)).toEqual({
        entitlement: 'free',
        trialExpiresAt: null,
      });
    });

    it('periodType === TRIAL이면 entitlement가 trial이다', () => {
      const info = makeCustomerInfo({
        hasPremiumEntitlement: true,
        periodType: 'TRIAL',
        expirationDate: '2024-02-07T00:00:00Z',
      });

      expect(extractEntitlement(info).entitlement).toBe('trial');
    });

    it('periodType === TRIAL이면 trialExpiresAt에 expirationDate 값이 담긴다', () => {
      const expiresAt = '2024-02-07T00:00:00Z';
      const info = makeCustomerInfo({
        hasPremiumEntitlement: true,
        periodType: 'TRIAL',
        expirationDate: expiresAt,
      });

      expect(extractEntitlement(info).trialExpiresAt).toBe(expiresAt);
    });

    it('periodType !== TRIAL이면 entitlement가 premium이다', () => {
      const info = makeCustomerInfo({
        hasPremiumEntitlement: true,
        periodType: 'NORMAL',
        expirationDate: '2024-12-31T00:00:00Z',
      });

      expect(extractEntitlement(info).entitlement).toBe('premium');
    });

    it('periodType !== TRIAL이면 trialExpiresAt은 null이다', () => {
      const info = makeCustomerInfo({
        hasPremiumEntitlement: true,
        periodType: 'NORMAL',
        expirationDate: '2024-12-31T00:00:00Z',
      });

      expect(extractEntitlement(info).trialExpiresAt).toBeNull();
    });

    it('periodType === TRIAL이지만 expirationDate null이면 trialExpiresAt도 null이다', () => {
      const info = makeCustomerInfo({
        hasPremiumEntitlement: true,
        periodType: 'TRIAL',
        expirationDate: null,
      });

      expect(extractEntitlement(info).trialExpiresAt).toBeNull();
    });
  });

  // ─── configurePurchases ───────────────────────────────────────────────────
  describe('configurePurchases — 수용 기준: SDK 초기화', () => {
    it('Purchases.configure를 1회 호출한다', () => {
      configurePurchases();

      expect(vi.mocked(Purchases.configure)).toHaveBeenCalledTimes(1);
    });

    it('apiKey를 포함한 객체를 configure에 전달한다', () => {
      configurePurchases();

      expect(vi.mocked(Purchases.configure)).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: expect.any(String) }),
      );
    });

    it('REVENUECAT_IOS_API_KEY 미설정 시 apiKey가 빈 문자열로 fallback된다', () => {
      delete process.env.REVENUECAT_IOS_API_KEY;
      configurePurchases();

      expect(vi.mocked(Purchases.configure)).toHaveBeenCalledWith({ apiKey: '' });
    });
  });

  // ─── revenueCatLogin ──────────────────────────────────────────────────────
  describe('revenueCatLogin — 수용 기준: 로그인 후 Purchases.logIn 호출', () => {
    it('Purchases.logIn에 userId를 전달한다', async () => {
      vi.mocked(Purchases.logIn).mockResolvedValue({
        customerInfo: makeCustomerInfo(),
        created: false,
      });

      await revenueCatLogin('user-uuid-abc');

      expect(vi.mocked(Purchases.logIn)).toHaveBeenCalledWith('user-uuid-abc');
    });

    it('Purchases.logIn에서 받은 customerInfo를 반환한다', async () => {
      const fakeInfo = makeCustomerInfo({ hasPremiumEntitlement: true, periodType: 'TRIAL' });
      vi.mocked(Purchases.logIn).mockResolvedValue({
        customerInfo: fakeInfo,
        created: true,
      });

      const result = await revenueCatLogin('user-uuid-abc');

      expect(result).toBe(fakeInfo);
    });

    it('Purchases.logIn 실패 시 에러를 그대로 throw한다', async () => {
      vi.mocked(Purchases.logIn).mockRejectedValue(new Error('network error'));

      await expect(revenueCatLogin('user-uuid-abc')).rejects.toThrow('network error');
    });
  });

  // ─── getCustomerInfo ──────────────────────────────────────────────────────
  describe('getCustomerInfo — 수용 기준: 포그라운드 복귀 시 재조회', () => {
    it('Purchases.getCustomerInfo를 호출하고 결과를 반환한다', async () => {
      const fakeInfo = makeCustomerInfo();
      vi.mocked(Purchases.getCustomerInfo).mockResolvedValue(fakeInfo);

      const result = await getCustomerInfo();

      expect(vi.mocked(Purchases.getCustomerInfo)).toHaveBeenCalledTimes(1);
      expect(result).toBe(fakeInfo);
    });
  });

  // ─── revenueCatLogout ─────────────────────────────────────────────────────
  describe('revenueCatLogout — 수용 기준: 로그아웃 처리', () => {
    it('Purchases.logOut을 호출한다', async () => {
      vi.mocked(Purchases.logOut).mockResolvedValue(makeCustomerInfo());

      await revenueCatLogout();

      expect(vi.mocked(Purchases.logOut)).toHaveBeenCalledTimes(1);
    });
  });

  // ─── addCustomerInfoListener ──────────────────────────────────────────────
  describe('addCustomerInfoListener — 수용 기준: 실시간 구독 상태 반영', () => {
    it('Purchases.addCustomerInfoUpdateListener에 callback을 등록한다', () => {
      const cb = vi.fn();
      addCustomerInfoListener(cb);

      expect(vi.mocked(Purchases.addCustomerInfoUpdateListener)).toHaveBeenCalledWith(cb);
    });

    it('반환된 cleanup 함수를 호출하면 removeCustomerInfoUpdateListener가 실행된다', () => {
      const cb = vi.fn();
      const remove = addCustomerInfoListener(cb);
      remove();

      expect(vi.mocked(Purchases.removeCustomerInfoUpdateListener)).toHaveBeenCalledWith(cb);
    });
  });
});
