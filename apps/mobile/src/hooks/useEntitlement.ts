import { useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '@store/auth-store';
import {
  getCustomerInfo,
  extractEntitlement,
  addCustomerInfoListener,
} from '@services/revenue-cat';

/**
 * entitlement 동기화 훅
 * - 앱 포그라운드 복귀 시 RevenueCat 재조회
 * - CustomerInfoUpdateListener로 실시간 반영
 */
export function useEntitlementSync() {
  const { setEntitlement, isAuthenticated } = useAuthStore();

  const syncEntitlement = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const customerInfo = await getCustomerInfo();
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
      setEntitlement(entitlement, trialExpiresAt);
    } catch (e) {
      // 네트워크 오류 시 기존 캐시값 유지
      console.warn('RevenueCat sync failed:', e);
    }
  }, [isAuthenticated, setEntitlement]);

  // 포그라운드 복귀 시 동기화
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        syncEntitlement();
      }
    });
    return () => subscription.remove();
  }, [syncEntitlement]);

  // CustomerInfo 실시간 리스너
  useEffect(() => {
    if (!isAuthenticated) return;
    const remove = addCustomerInfoListener((customerInfo) => {
      const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
      setEntitlement(entitlement, trialExpiresAt);
    });
    return remove;
  }, [isAuthenticated, setEntitlement]);

  return { syncEntitlement };
}

/**
 * 트라이얼 D-day 여부 계산 (배너 표시용)
 */
export function useTrialDaysRemaining(): number | null {
  const { entitlement, trialExpiresAt } = useAuthStore();

  if (entitlement !== 'trial' || !trialExpiresAt) return null;

  const expiresMs = new Date(trialExpiresAt).getTime();
  const nowMs = Date.now();
  const remainMs = expiresMs - nowMs;

  if (remainMs <= 0) return 0;
  return Math.ceil(remainMs / (1000 * 60 * 60 * 24));
}
