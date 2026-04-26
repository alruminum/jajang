/**
 * S15 — 구독 결제 화면 (SubscribeScreen)
 *
 * 커버 스토리: Epic 05 Story 1 (F12 IAP 구독 — 월 ₩3,900 / 연 ₩29,000), Story 5 (구독 진입점)
 * impl: docs/milestones/v1/epics/epic-05-monetization/impl/03-app-subscribe-screen.md
 *
 * 모듈 경계:
 * - S15 → revenue-cat.ts: fetchOfferings, purchasePackage, restorePurchases, isCancelledError
 * - S15 → AuthStore: setEntitlement (결제 성공 즉시 반영)
 * - S15 → navigation: goBack() (헤더 뒤로), navigate('Main') (결제/복원 성공)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import {
  fetchOfferings,
  purchasePackage,
  restorePurchases,
  isCancelledError,
  extractEntitlement,
} from '@services/revenue-cat';
import type { PurchasesOffering } from 'react-native-purchases';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PRIVACY_URL = 'https://jajang.app/privacy';
const TERMS_URL = 'https://jajang.app/terms';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type PlanType = 'monthly' | 'annual';

interface PlanCardProps {
  planType: PlanType;
  price: string;           // "₩3,900/월" | "₩29,000/년"
  savingsBadge?: string;   // "월 ₩2,417 절약" (연간만)
  isSelected: boolean;
  onSelect: () => void;
}

type SubscribeScreenProps = NativeStackScreenProps<MainStackParamList, 'Subscribe'>;

// ─── PlanCard 컴포넌트 ────────────────────────────────────────────────────────

function PlanCard({ planType, price, savingsBadge, isSelected, onSelect }: PlanCardProps) {
  return (
    <TouchableOpacity
      style={[styles.planCard, isSelected && styles.planCardSelected]}
      onPress={onSelect}
      accessibilityLabel={`${planType === 'monthly' ? '월간' : '연간'} 플랜 선택`}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={styles.planCardLeft}>
        <Text style={[styles.planCardTitle, isSelected && styles.planCardTitleSelected]}>
          {planType === 'monthly' ? '월간 구독' : '연간 구독'}
        </Text>
        <Text style={[styles.planCardPrice, isSelected && styles.planCardPriceSelected]}>
          {price}
        </Text>
      </View>
      {savingsBadge && (
        <View style={styles.savingsBadge}>
          <Text style={styles.savingsBadgeText}>{savingsBadge}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── PlanCardSkeleton ─────────────────────────────────────────────────────────

function PlanCardSkeleton() {
  return (
    <>
      <View style={[styles.planCard, styles.skeleton]} />
      <View style={[styles.planCard, styles.skeleton]} />
    </>
  );
}

// ─── BenefitList 컴포넌트 ─────────────────────────────────────────────────────

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

// ─── S15SubscribeScreen (메인 화면) ───────────────────────────────────────────

export default function S15SubscribeScreen({ navigation }: SubscribeScreenProps) {
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { entitlement } = useAuthStore();

  // MVP 단순화: entitlement==='free' 유저에게 트라이얼 배지 표시
  const showTrialBadge = entitlement === 'free';

  // ─── Offerings 로드 ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadOfferings() {
      try {
        const off = await fetchOfferings();
        setOffering(off);
      } catch {
        showToast('상품 정보를 불러오지 못했어요');
      } finally {
        setIsLoadingOfferings(false);
      }
    }
    loadOfferings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 토스트 클린업 ──────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // ─── 헬퍼 ───────────────────────────────────────────────────────────────────

  function showToast(message: string): void {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast({ message: '', visible: false });
      toastTimerRef.current = null;
    }, 3_000);
  }

  // ─── 결제 플로우 ─────────────────────────────────────────────────────────────

  async function handleSubscribe(): Promise<void> {
    if (isLoading) return;

    // Offerings 로드 실패 상태 — silent return 대신 사용자에게 피드백 제공
    if (!offering) {
      showToast('상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
      return;
    }

    const pkg =
      selectedPlan === 'monthly' ? offering.monthly : offering.annual;

    if (!pkg) {
      showToast('선택한 상품을 찾을 수 없어요');
      return;
    }

    setIsLoading(true);
    try {
      const customerInfo = await purchasePackage(pkg);
      const { entitlement: newEntitlement, trialExpiresAt } =
        extractEntitlement(customerInfo);

      useAuthStore.getState().setEntitlement(newEntitlement, trialExpiresAt);

      showToast('구독이 완료됐어요');
      navigation.navigate('HomeTabs');
    } catch (error) {
      if (isCancelledError(error)) {
        // 사용자 취소 — 무음 처리
        return;
      }
      showToast('결제에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── 복원 플로우 ─────────────────────────────────────────────────────────────

  async function handleRestore(): Promise<void> {
    setIsLoading(true);
    try {
      const customerInfo = await restorePurchases();
      const { entitlement: restoredEntitlement, trialExpiresAt } =
        extractEntitlement(customerInfo);

      if (restoredEntitlement !== 'free') {
        useAuthStore.getState().setEntitlement(restoredEntitlement, trialExpiresAt);
        showToast('구독이 복원됐어요');
        navigation.navigate('HomeTabs');
      } else {
        showToast('복원할 구독이 없어요');
      }
    } catch {
      showToast('복원에 실패했어요');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* 뒤로 버튼 */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        accessibilityLabel="뒤로"
      >
        <Text style={styles.backBtnText}>←</Text>
      </TouchableOpacity>

      {/* 헤드라인 */}
      <Text style={styles.headline}>
        아기 곁에서 더 오래{'\n'}함께해요
      </Text>

      {/* 혜택 목록 */}
      <BenefitList
        benefits={[
          '백그라운드 재생',
          '광고 없음',
          '오프라인 재생',
          '자장가 무제한 생성',
        ]}
      />

      {/* 플랜 카드 */}
      {isLoadingOfferings ? (
        <PlanCardSkeleton />
      ) : (
        <>
          <PlanCard
            planType="monthly"
            price={offering?.monthly?.product?.priceString ?? '₩3,900/월'}
            isSelected={selectedPlan === 'monthly'}
            onSelect={() => setSelectedPlan('monthly')}
          />
          <PlanCard
            planType="annual"
            price={offering?.annual?.product?.priceString ?? '₩29,000/년'}
            savingsBadge="월 ₩2,417 절약"
            isSelected={selectedPlan === 'annual'}
            onSelect={() => setSelectedPlan('annual')}
          />
        </>
      )}

      {/* 트라이얼 배지 (미사용 유저 한정) */}
      {showTrialBadge && (
        <Text style={styles.trialBadge}>7일 무료 체험 후 과금</Text>
      )}

      {/* 구독 CTA */}
      <TouchableOpacity
        style={[styles.subscribeBtn, isLoading && styles.disabled]}
        onPress={handleSubscribe}
        disabled={isLoading || isLoadingOfferings}
        accessibilityLabel="구독 시작하기"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.subscribeBtnText}>구독 시작하기</Text>
        )}
      </TouchableOpacity>

      {/* 복원 */}
      <TouchableOpacity onPress={handleRestore} disabled={isLoading}>
        <Text style={styles.restoreText}>구독 복원하기</Text>
      </TouchableOpacity>

      {/* 법적 링크 */}
      <View style={styles.legalRow}>
        <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.legalText}>개인정보처리방침</Text>
        </TouchableOpacity>
        <Text style={styles.legalDot}> · </Text>
        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={styles.legalText}>이용약관</Text>
        </TouchableOpacity>
      </View>

      {/* 인라인 토스트 */}
      {toast.visible && (
        <View style={styles.toast} accessibilityLiveRegion="assertive">
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 8,
  },
  backBtnText: {
    color: '#F5F5F5',
    fontSize: 22,
  },
  headline: {
    color: '#F5F5F5',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 36,
    marginBottom: 20,
  },
  benefitList: {
    marginBottom: 24,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitIcon: {
    color: '#82B090',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
    width: 16,
  },
  benefitText: {
    color: '#A0A5C0',
    fontSize: 14,
    lineHeight: 20,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1D35',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2A2E48',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    minHeight: 72,
  },
  planCardSelected: {
    borderColor: '#4A6FFF',
    backgroundColor: '#1E2340',
  },
  planCardLeft: {
    flex: 1,
  },
  planCardTitle: {
    color: '#7B80A0',
    fontSize: 13,
    marginBottom: 4,
  },
  planCardTitleSelected: {
    color: '#A0A5C0',
  },
  planCardPrice: {
    color: '#F5F5F5',
    fontSize: 17,
    fontWeight: '600',
  },
  planCardPriceSelected: {
    color: '#F5F5F5',
  },
  savingsBadge: {
    backgroundColor: '#82B090',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  savingsBadgeText: {
    color: '#12152B',
    fontSize: 11,
    fontWeight: '700',
  },
  skeleton: {
    opacity: 0.3,
    minHeight: 72,
  },
  trialBadge: {
    color: '#82B090',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  subscribeBtn: {
    backgroundColor: '#4A6FFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreText: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 10,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  legalText: {
    color: '#4A4E68',
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: '#4A4E68',
    fontSize: 11,
  },
  toast: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(30, 34, 60, 0.95)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    color: '#F5F5F5',
    fontSize: 13,
  },
});
