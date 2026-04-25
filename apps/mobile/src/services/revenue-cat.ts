import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';
import { useAuthStore } from '@store/auth-store';

// 개발환경 로그 활성화
if (__DEV__) {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
}

/**
 * 앱 초기화 시 1회 호출 (App.tsx)
 * 유저 로그인 전에 configure 먼저 실행 필수
 */
export function configurePurchases() {
  const apiKey = Platform.select({
    ios: process.env.REVENUECAT_IOS_API_KEY ?? '',
    android: process.env.REVENUECAT_ANDROID_API_KEY ?? '',
    default: '',
  });
  Purchases.configure({ apiKey });
}

/**
 * 로그인/가입 완료 직후 호출
 * userId = server UUID (문자열)
 * RevenueCat에서 자동으로 트라이얼 시작 (대시보드 설정 기준)
 */
export async function revenueCatLogin(userId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

/**
 * CustomerInfo → 앱 내부 entitlement 타입 변환
 * periodType: 'TRIAL' | 'INTRO' | 'NORMAL' (RevenueCat v7)
 */
export function extractEntitlement(
  customerInfo: CustomerInfo,
): { entitlement: 'free' | 'trial' | 'premium'; trialExpiresAt: string | null } {
  const active = customerInfo.entitlements.active;
  const premiumEntry = active['premium']; // RevenueCat 대시보드 entitlement ID: 'premium'

  if (!premiumEntry) {
    return { entitlement: 'free', trialExpiresAt: null };
  }

  // periodType: 'TRIAL' | 'INTRO' | 'NORMAL' — RevenueCat v7 EntitlementInfo
  const isTrial = premiumEntry.periodType === 'TRIAL';
  const expiresAt = premiumEntry.expirationDate ?? null; // ISO 8601 string

  return {
    entitlement: isTrial ? 'trial' : 'premium',
    trialExpiresAt: isTrial ? expiresAt : null,
  };
}

/**
 * 로그인/가입 완료 직후 RevenueCat 연동 + Zustand entitlement 업데이트
 * S04SignupScreen, S05LoginScreen 4곳 공통 호출 — 이 함수 하나로 대체
 * 실패 시 console.warn만 출력하고 기존 entitlement 유지 (페일-오픈)
 */
export async function syncEntitlementAfterLogin(userId: string): Promise<void> {
  try {
    const customerInfo = await revenueCatLogin(userId);
    const { entitlement, trialExpiresAt } = extractEntitlement(customerInfo);
    useAuthStore.getState().setEntitlement(entitlement, trialExpiresAt);
  } catch (e) {
    console.warn('RevenueCat logIn failed:', e);
  }
}

/**
 * 현재 CustomerInfo 조회 (앱 포그라운드 복귀 시 호출)
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * 로그아웃 (탈퇴/로그아웃 시 호출)
 */
export async function revenueCatLogout(): Promise<void> {
  await Purchases.logOut();
}

/**
 * CustomerInfo listener 등록 (구독 상태 변경 실시간 반영)
 * App.tsx에서 1회 등록, unmount 시 제거
 */
export function addCustomerInfoListener(
  callback: (customerInfo: CustomerInfo) => void,
): () => void {
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}
