import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
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
 * RevenueCat Offerings 조회.
 * 'default' offering을 사용. 패키지: MONTHLY / ANNUAL.
 * 실패 시 null 반환 (네트워크 오류 처리는 호출자).
 */
export async function fetchOfferings(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/**
 * 패키지 결제 실행.
 * RevenueCat purchasePackage → CustomerInfo 반환.
 * 사용자 취소: throws PurchasesError (code=PURCHASE_CANCELLED_ERROR) → 호출자에서 구분 처리.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/**
 * 기존 구독 복원.
 * 기기 변경 또는 앱 재설치 후 호출.
 * 복원 대상 없으면 CustomerInfo.entitlements.active 빈 객체.
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

/**
 * RevenueCat PurchasesError 취소 여부 확인 헬퍼.
 * PURCHASES_ERROR_CODE 값은 string ('1') — 숫자 아님.
 */
export function isCancelledError(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return true;
  }
  return false;
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

/**
 * RevenueCat 구독 관리 URL 조회.
 * iOS: App Store 구독 관리 URL (itms-apps://)
 * Android: Google Play 구독 관리 URL
 * 구독이 없는 유저나 Android 일부 환경에서 null 반환.
 */
export async function getManagementURL(): Promise<string | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.managementURL ?? null;
  } catch {
    return null;
  }
}
