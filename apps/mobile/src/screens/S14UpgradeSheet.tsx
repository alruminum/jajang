/**
 * S14 — 업그레이드 시트 (UpgradeSheet)
 *
 * 커버 스토리: S14 A형 (백그라운드 재생 시도), Rewarded Ad 언락, 트라이얼 유저 미노출
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/06-app-upgrade-sheet-A.md
 *
 * variant 분기:
 * - 'background': A형 — Rewarded Ad + 구독 유도
 * - 'generation-exhausted': B형 — 구독 유도 (횟수 소진)
 *
 * 모듈 경계:
 * - S14 → rewardedAdService: loadAndShowRewardedAd()
 * - S14 → SubscriptionSlice: rewardedAdUsedThisMonth, rewardedAdMonthKey read/write
 * - S14 → PlayerSlice: rewardedUnlockExpiresAt write (Rewarded 완료 시)
 * - S14 → AudioEngine: resumePlayback() (Rewarded 완료 후)
 * - S14 → navigation: goBack() (S13 복귀), navigate('Subscribe')
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import { usePlayerStore } from '@store/player-store';
import { useSubscriptionStore, getCurrentMonthKey } from '@store/subscriptionSlice';
import {
  loadAndShowRewardedAd,
  getMidnightTimestamp,
} from '@services/rewardedAdService';
import { resumePlayback } from '@audio/AudioEngine';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type UpgradeSheetProps = NativeStackScreenProps<MainStackParamList, 'Upgrade'>;

// ─── 인라인 토스트 (라이브러리 미사용) ────────────────────────────────────────

interface ToastState {
  message: string;
  visible: boolean;
}

// ─── VariantBackground ────────────────────────────────────────────────────────

interface VariantBackgroundProps {
  showRewardedButton: boolean;
  monthlyUsed: number;
  isLoadingAd: boolean;
  onRewardedPress: () => void;
  onSubscribePress: () => void;
  onDismiss: () => void;
}

function VariantBackground({
  showRewardedButton,
  monthlyUsed,
  isLoadingAd,
  onRewardedPress,
  onSubscribePress,
  onDismiss,
}: VariantBackgroundProps) {
  return (
    <>
      <Text style={styles.headline}>💤 아기가 잠드는 동안에도</Text>
      <Text style={styles.body}>화면을 꺼도 자장가가 계속 흘러요</Text>

      {showRewardedButton && (
        <TouchableOpacity
          style={[styles.rewardedBtn, isLoadingAd && styles.btnDisabled]}
          onPress={onRewardedPress}
          disabled={isLoadingAd}
          accessibilityLabel="광고 보고 오늘 밤 무료로 쓸게요"
        >
          {isLoadingAd ? (
            <ActivityIndicator color="#12152B" size="small" />
          ) : (
            <Text style={styles.rewardedBtnText}>광고 보고 오늘 밤 무료로 쓸게요</Text>
          )}
        </TouchableOpacity>
      )}

      {!showRewardedButton && monthlyUsed >= 7 && (
        <Text style={styles.exhaustedMsg}>이번 달은 이미 모두 사용했어요</Text>
      )}

      <TouchableOpacity
        style={styles.subscribeBtn}
        onPress={onSubscribePress}
        accessibilityLabel="구독하기"
      >
        <Text style={styles.subscribeBtnText}>구독하기</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDismiss} accessibilityLabel="지금은 괜찮아요">
        <Text style={styles.dismissText}>지금은 괜찮아요</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── VariantGenerationExhausted ───────────────────────────────────────────────

interface VariantGenerationExhaustedProps {
  onSubscribePress: () => void;
  onDismiss: () => void;
}

function VariantGenerationExhausted({
  onSubscribePress,
  onDismiss,
}: VariantGenerationExhaustedProps) {
  return (
    <>
      <Text style={styles.headline}>🎵 자장가 생성 횟수를 모두 사용했어요</Text>
      <Text style={styles.body}>구독하면 무제한으로 자장가를 만들 수 있어요</Text>

      <TouchableOpacity
        style={styles.subscribeBtn}
        onPress={onSubscribePress}
        accessibilityLabel="구독하기"
      >
        <Text style={styles.subscribeBtnText}>구독하기</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onDismiss} accessibilityLabel="지금은 괜찮아요">
        <Text style={styles.dismissText}>지금은 괜찮아요</Text>
      </TouchableOpacity>
    </>
  );
}

// ─── S14UpgradeSheet (메인 화면) ──────────────────────────────────────────────

export default function S14UpgradeSheet({ route, navigation }: UpgradeSheetProps) {
  const { variant } = route.params;

  const { entitlement } = useAuthStore();
  const { rewardedAdUsedThisMonth, rewardedAdMonthKey } = useSubscriptionStore();

  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const [adLoadFailed, setAdLoadFailed] = useState(false);
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 월 전환 시 카운터 리셋 ─────────────────────────────────────────────────

  useEffect(() => {
    const currentMonthKey = getCurrentMonthKey();
    if (rewardedAdMonthKey !== currentMonthKey) {
      useSubscriptionStore.setState({
        rewardedAdUsedThisMonth: 0,
        rewardedAdMonthKey: currentMonthKey,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Trial 유저 방어: A형에 trial이 도달하면 즉시 복귀 ──────────────────────

  useEffect(() => {
    if (variant === 'background' && entitlement === 'trial') {
      // trial은 백그라운드 허용 — 팝업이 뜨면 UX 오류 (AudioEngine 방어코드 누락)
      navigation.goBack();
    }
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

  function goToSubscribe(): void {
    navigation.navigate('Subscribe');
  }

  function handleExhaustedDismiss(): void {
    navigation.goBack();
  }

  // ─── Rewarded Ad 핸들러 ──────────────────────────────────────────────────────

  async function handleRewardedAd(): Promise<void> {
    setIsLoadingAd(true);

    const result = await loadAndShowRewardedAd();

    setIsLoadingAd(false);

    switch (result.status) {
      case 'completed': {
        // 자정까지 백그라운드 언락
        const midnight = getMidnightTimestamp();

        // SubscriptionSlice 카운터 증가
        useSubscriptionStore.setState((state) => ({
          rewardedAdUsedThisMonth: state.rewardedAdUsedThisMonth + 1,
        }));

        // PlayerSlice에 언락 만료 시각 기록 (AudioEngine 진실 공급원)
        usePlayerStore.setState({ rewardedUnlockExpiresAt: midnight });

        // S13 복귀 + 재생 재개
        await resumePlayback();
        navigation.goBack();
        break;
      }

      case 'dismissed':
        // 시청 완료 전 닫기 — 언락 없음, 팝업 유지
        break;

      case 'load_failed':
        showToast('광고를 불러오지 못했어요');
        // 광고 버튼만 비활성화, 구독 버튼 유지
        setAdLoadFailed(true);
        break;

      case 'monthly_exhausted':
        // UI에서 이미 monthlyUsed >= 7로 버튼 숨김 — 도달 불가 케이스
        break;
    }
  }

  // ─── Rewarded 버튼 노출 조건 ────────────────────────────────────────────────
  // - A형 variant
  // - 무료 유저 (trial은 팝업 도달 자체가 막혀 있음)
  // - 이번 달 7회 미만 시청
  // - 광고 로드 실패 상태 아님

  const showRewardedButton =
    variant === 'background' &&
    entitlement === 'free' &&
    rewardedAdUsedThisMonth < 7 &&
    !adLoadFailed;

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* 닫기 버튼 */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeBtn}
            accessibilityLabel="닫기"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          {/* 컨텐츠 분기 */}
          {variant === 'background' ? (
            <VariantBackground
              showRewardedButton={showRewardedButton}
              monthlyUsed={rewardedAdUsedThisMonth}
              isLoadingAd={isLoadingAd}
              onRewardedPress={handleRewardedAd}
              onSubscribePress={goToSubscribe}
              onDismiss={() => navigation.goBack()}
            />
          ) : (
            <VariantGenerationExhausted
              onSubscribePress={goToSubscribe}
              onDismiss={handleExhaustedDismiss}
            />
          )}

          {/* 인라인 토스트 */}
          {toast.visible && (
            <View style={styles.toast} accessibilityLiveRegion="assertive">
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#1A1D35',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    minHeight: 280,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#7B80A0',
    fontSize: 18,
  },
  headline: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  body: {
    color: '#A0A5C0',
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20,
  },
  rewardedBtn: {
    backgroundColor: '#F5C97A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  rewardedBtnText: {
    color: '#12152B',
    fontSize: 15,
    fontWeight: '600',
  },
  exhaustedMsg: {
    color: '#7B80A0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  subscribeBtn: {
    backgroundColor: '#4A6FFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dismissText: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  toast: {
    position: 'absolute',
    bottom: 48,
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
