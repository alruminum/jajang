/**
 * BannerAdSlot — 배너 광고 컴포넌트 (무료 유저 전용)
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/07-app-banner-ad.md
 *
 * 동작:
 * - 광고 로드 전: height=0, 공간 차지 없음
 * - 광고 로드 성공: 배너 표시
 * - 광고 로드 실패: null 반환 (collapse — 빈 공간 없음)
 *
 * S13 PlayScreen에서 entitlement==='free' 조건부 렌더.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

/** 개발환경: TestIds.BANNER, 프로덕션: 실제 Unit ID */
const BANNER_UNIT_ID: string = __DEV__
  ? TestIds.BANNER
  : (process.env.ADMOB_BANNER_UNIT_ID ?? TestIds.BANNER);

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface BannerAdSlotState {
  loaded: boolean;
  failed: boolean;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function BannerAdSlot() {
  const [adState, setAdState] = useState<BannerAdSlotState>({
    loaded: false,
    failed: false,
  });

  // 로드 실패 시 collapse — 빈 공간 없음 (ux-flow.md S13)
  if (adState.failed) {
    return null;
  }

  return (
    <View style={[styles.container, !adState.loaded && styles.hidden]}>
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdLoaded={() => {
          setAdState({ loaded: true, failed: false });
        }}
        onAdFailedToLoad={(error) => {
          setAdState({ loaded: false, failed: true });
          // 배너 로드 실패는 빈번 발생 — info 레벨 warn으로 로깅
          console.warn('[BannerAdSlot] banner_load_failed:', error.message);
        }}
      />
    </View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    // 하단 고정 — S13 SafeAreaView 내부 하단
  },
  hidden: {
    // 로드 전 공간 예약 없음 — 로드 완료 시 렌더
    height: 0,
    overflow: 'hidden',
  },
});
