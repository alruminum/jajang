/**
 * rewardedAdService — AdMob Rewarded Ad 래퍼
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/06-app-upgrade-sheet-A.md
 *
 * 주의:
 * - EARNED_REWARD는 CLOSED 이전에 fire됨 (iOS/Android 모두). 단, 실기기 테스트 필수.
 * - cleanup 패턴으로 중복 resolve 방지.
 * - 개발환경(__DEV__)에서 TestIds.REWARDED fallback 처리.
 */

import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useSubscriptionStore } from '@store/subscriptionSlice';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 월 Rewarded Ad 최대 시청 횟수 (PRD F11) */
export const REWARDED_MONTHLY_LIMIT = 7;

/** 개발환경: TestIds.REWARDED, 프로덕션: 실제 Unit ID */
const REWARDED_UNIT_ID: string = __DEV__
  ? TestIds.REWARDED
  : (process.env.ADMOB_REWARDED_UNIT_ID ?? TestIds.REWARDED);

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type RewardedAdResult =
  | { status: 'completed' }
  | { status: 'dismissed' }
  | { status: 'load_failed'; error: string }
  | { status: 'monthly_exhausted' };

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * Rewarded Ad 로드 + 노출.
 * Promise는 단 1회만 resolve된다 (cleanup 패턴으로 중복 방지).
 *
 * 반환값:
 * - 'completed': 시청 완료 → 언락 처리
 * - 'dismissed': 중도 이탈 → 팝업 유지
 * - 'load_failed': 로드 실패 또는 15초 타임아웃
 * - 'monthly_exhausted': 월 제한 초과 (UI에서 방어하므로 도달 불가)
 */
export async function loadAndShowRewardedAd(): Promise<RewardedAdResult> {
  if (isMonthlyExhausted()) {
    return { status: 'monthly_exhausted' };
  }

  const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
    requestNonPersonalizedAdsOnly: false,
    // COPPA: 부모용 앱 (tag_for_child_directed_treatment=false 기본값)
  });

  return new Promise<RewardedAdResult>((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function safeResolve(result: RewardedAdResult): void {
      if (resolved) return;
      resolved = true;
      cleanup();
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      resolve(result);
    }

    const unsubscribeLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show();
    });

    const unsubscribeEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        // EARNED_REWARD가 CLOSED 이전에 fire됨 — 여기서 completed 처리
        safeResolve({ status: 'completed' });
      },
    );

    const unsubscribeClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      // EARNED_REWARD가 먼저 fire됐다면 이미 resolved — safeResolve가 no-op
      // 사용자가 중도 이탈한 경우 dismissed 처리
      safeResolve({ status: 'dismissed' });
    });

    const unsubscribeError = ad.addAdEventListener(
      AdEventType.ERROR,
      (error: Error) => {
        safeResolve({ status: 'load_failed', error: error.message });
      },
    );

    function cleanup(): void {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
    }

    // 로드 시작
    ad.load();

    // 15초 타임아웃 (AdMob 권장 10~15초)
    timeoutId = setTimeout(() => {
      safeResolve({ status: 'load_failed', error: 'timeout' });
    }, 15_000);
  });
}

/**
 * 이번 달 Rewarded Ad 시청 횟수 조회.
 * SubscriptionSlice 경유.
 */
export function getMonthlyUsageCount(): number {
  return useSubscriptionStore.getState().rewardedAdUsedThisMonth;
}

/**
 * 이번 달 Rewarded Ad 시청 횟수가 한도(7회)에 도달했는지 확인.
 */
export function isMonthlyExhausted(): boolean {
  return getMonthlyUsageCount() >= REWARDED_MONTHLY_LIMIT;
}

/**
 * 오늘 자정 timestamp (ms) 계산.
 * 로컬 시간 기준 — 수면 앱 특성상 지역 시간 자정 사용.
 */
export function getMidnightTimestamp(): number {
  const midnight = new Date();
  midnight.setHours(23, 59, 59, 999);
  return midnight.getTime();
}
