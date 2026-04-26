import { useEffect } from 'react';
import type { NavigationProp } from '@react-navigation/native';

import { useAuthStore } from '@store/auth-store';

/**
 * S06 홈 화면 마운트 시 트라이얼 만료 감지.
 * entitlement='trial' + trialExpiresAt 경과 → S17 자동 이동.
 *
 * 트리거 조건:
 * - useEntitlementSync가 포그라운드 복귀 시 재조회 → entitlement 업데이트
 * - 만료 판단은 로컬 trialExpiresAt 기준 (서버 동기화 전 즉각 반응)
 *
 * impl: docs/milestones/v1/epics/epic-05-monetization/impl/04-app-trial-expired-screen.md
 */
export function useTrialExpiredGuard(navigation: NavigationProp<any>): void {
  const { entitlement, trialExpiresAt } = useAuthStore();

  useEffect(() => {
    // 트라이얼 만료 판단
    // 조건: entitlement가 아직 'trial'인 상태에서 만료일 경과
    // (서버 webhook이 EXPIRATION 처리 전에 클라이언트가 먼저 감지하는 케이스)
    if (entitlement === 'trial' && trialExpiresAt) {
      const expiresMs = new Date(trialExpiresAt).getTime();
      if (Date.now() >= expiresMs) {
        navigation.navigate('TrialExpired' as never);
        return;
      }
    }

    // entitlement가 이미 'free'로 전환된 경우 (webhook 처리 완료)
    // trialExpiresAt이 있고 trial 기간을 이미 사용한 유저 → S17 진입
    // 단, 최초 free 가입 유저(trialExpiresAt=null)는 S17 미진입
    if (entitlement === 'free' && trialExpiresAt !== null) {
      // trialExpiresAt이 존재 = 과거에 trial을 사용한 유저
      // 이 케이스는 앱 재시작 / 포그라운드 복귀 시 처리
      navigation.navigate('TrialExpired' as never);
    }
  }, [entitlement, trialExpiresAt, navigation]);
}
