/**
 * adMobService — AdMob 초기화 래퍼
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/07-app-banner-ad.md
 *
 * 주의:
 * - App.tsx 기동 시 1회만 호출. 배너 렌더 이전에 완료 보장.
 * - COPPA: 부모용 앱 — 아동 대상 광고 제외 (tagForChildDirectedTreatment: false)
 */

import mobileAds, { MaxAdContentRating } from 'react-native-google-mobile-ads';

/**
 * AdMob SDK 초기화 + COPPA 설정.
 * 실패 시 호출부(App.tsx)에서 catch 처리.
 */
export async function initializeAdMob(): Promise<void> {
  await mobileAds().initialize();
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.PG,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });
}
