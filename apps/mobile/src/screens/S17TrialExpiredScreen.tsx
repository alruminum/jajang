/**
 * S17 — 트라이얼 만료 안내 화면 (TrialExpiredScreen)
 *
 * 커버 스토리: Epic 05 Story 5 진입점, UX Flow S17 (트라이얼 만료 → 구독 전환 or 무료 전환)
 * impl: docs/milestones/v1/epics/epic-05-monetization/impl/04-app-trial-expired-screen.md
 *
 * 모듈 경계:
 * - S17 → S15: navigate('Subscribe') — 구독 CTA
 * - S17 → S06: navigate('HomeTabs') — 무료 전환 후 홈 복귀
 * - S17 → AuthStore: setEntitlement('free', null) — trialExpiresAt 제거로 루프 방지
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type TrialExpiredScreenProps = NativeStackScreenProps<MainStackParamList, 'TrialExpired'>;

// ─── MoonCoverAnimation ───────────────────────────────────────────────────────

/**
 * S17 전용 달→구름 애니메이션 (UX Flow: "서서히 이동 2s ease-in")
 * 디자인 에셋 미전달 시 View 플레이스홀더로 동작.
 */
function MoonCoverAnimation() {
  const moonX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(moonX, {
      toValue: -40,       // 달이 구름 뒤로 40px 이동
      duration: 2000,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={styles.animationContainer}>
      {/* 구름 레이어 */}
      <View style={styles.cloudPlaceholder} />
      {/* 달 레이어 (애니메이션) */}
      <Animated.View
        style={[styles.moonPlaceholder, { transform: [{ translateX: moonX }] }]}
      />
    </View>
  );
}

// ─── BenefitList ──────────────────────────────────────────────────────────────

interface BenefitListProps {
  benefits: string[];
}

function BenefitList({ benefits }: BenefitListProps) {
  return (
    <View style={styles.benefitList}>
      {benefits.map((benefit) => (
        <View key={benefit} style={styles.benefitRow}>
          <Text style={styles.benefitIcon}>✓</Text>
          <Text style={styles.benefitText}>{benefit}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── S17TrialExpiredScreen ────────────────────────────────────────────────────

export default function S17TrialExpiredScreen({ navigation }: TrialExpiredScreenProps) {
  const { setEntitlement } = useAuthStore();

  function handleContinueFree() {
    // 무료 플랜 전환 확정: trialExpiresAt=null → useTrialExpiredGuard 재트리거 방지
    setEntitlement('free', null);
    navigation.navigate('HomeTabs');
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 달 → 구름 애니메이션 (2s ease-in) */}
      <MoonCoverAnimation />

      <Text style={styles.headline}>7일이 지났어요</Text>
      <Text style={styles.body}>
        아기 곁을 떠나면{'\n'}자장가도 멈춰요
      </Text>

      {/* 혜택 목록 */}
      <BenefitList
        benefits={[
          '백그라운드 재생',
          '광고 없음',
          '자장가 무제한 생성',
        ]}
      />

      <TouchableOpacity
        style={styles.subscribeBtn}
        onPress={() => navigation.navigate('Subscribe')}
        accessibilityLabel="구독 시작하기"
      >
        <Text style={styles.subscribeBtnText}>구독 시작하기</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleContinueFree}
        accessibilityLabel="무료로 계속할게요"
      >
        <Text style={styles.freeContinueText}>무료로 계속할게요</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  // 애니메이션 영역
  animationContainer: {
    width: 160,
    height: 160,
    marginBottom: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cloudPlaceholder: {
    position: 'absolute',
    width: 100,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2A2E48',
    right: 0,
  },
  moonPlaceholder: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#5A7AA8',
    left: 0,
  },

  // 텍스트
  headline: {
    color: '#EEF0F8',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#A0A5C0',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },

  // 혜택 목록
  benefitList: {
    width: '100%',
    marginBottom: 36,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  benefitIcon: {
    color: '#5A7AA8',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
    width: 16,
  },
  benefitText: {
    color: '#A0A5C0',
    fontSize: 15,
    lineHeight: 22,
  },

  // CTA 버튼
  subscribeBtn: {
    width: '100%',
    backgroundColor: '#4A6FFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // 무료 전환 링크
  freeContinueText: {
    color: '#7B80A0',
    fontSize: 14,
    paddingVertical: 10,
  },
});
