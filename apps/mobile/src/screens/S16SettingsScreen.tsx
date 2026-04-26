/**
 * S16 — 설정 화면 (SettingsScreen)
 *
 * 커버 스토리: Epic 05 Story 1 (구독 취소 딥링크 + 복원), Story 5 (구독 진입점), UX Flow S16
 * impl: docs/milestones/v1/epics/epic-05-monetization/impl/05-app-settings-subscription.md
 *
 * 모듈 경계:
 * - S16 → revenue-cat.ts: getManagementURL, revenueCatLogout
 * - S16 → AuthStore: entitlement, trialExpiresAt, userId read / clearAuth() write
 * - S16 → S15: navigate('Subscribe', { source: 'settings' })  [source 파라미터는 런타임 무시]
 * - S16 → Auth 스택: rootNavigation.navigate('Auth') — 로그아웃/탈퇴 후
 * - S16 → services/auth-api: deleteAccountAPI, deleteVoiceSamplesAPI
 * - S16 → services/tracks-api: deleteAllTracksAPI
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList, MainStackParamList } from '@navigation/types';
import { useAuthStore } from '@store/auth-store';
import { getManagementURL, revenueCatLogout } from '@services/revenue-cat';
import { deleteAccountAPI, deleteVoiceSamplesAPI } from '@services/auth-api';
import { deleteAllTracksAPI } from '@services/tracks-api';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const PRIVACY_URL = 'https://jajang.app/privacy';
const TERMS_URL = 'https://jajang.app/terms';
const APP_VERSION = '1.0.0';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** Alert.alert 기반 확인 다이얼로그. 확인 → true, 취소 → false */
function showConfirmDialog(title: string, message?: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '확인', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

// ─── SettingsRow 컴포넌트 ─────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  highlighted?: boolean;   // 강조 스타일 (무료 유저 업그레이드 CTA)
  destructive?: boolean;   // 빨간 텍스트 (계정 탈퇴)
  isLoading?: boolean;     // 인라인 스피너 (삭제 진행 중)
  disabled?: boolean;
}

function SettingsRow({
  label,
  onPress,
  accessibilityLabel,
  highlighted = false,
  destructive = false,
  isLoading = false,
  disabled = false,
}: SettingsRowProps) {
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity
      style={[styles.row, isDisabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
    >
      <Text
        style={[
          styles.rowLabel,
          highlighted && styles.rowLabelHighlighted,
          destructive && styles.rowLabelDestructive,
        ]}
      >
        {label}
      </Text>
      {isLoading ? (
        <ActivityIndicator size="small" color="#7B80A0" />
      ) : (
        <Text style={styles.rowChevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={styles.divider} />;
}

// ─── SubscriptionSection ──────────────────────────────────────────────────────

interface SubscriptionSectionProps {
  mainNavigation: NativeStackNavigationProp<MainStackParamList>;
  showToast: (message: string) => void;
}

function SubscriptionSection({ mainNavigation, showToast }: SubscriptionSectionProps) {
  const { entitlement, trialExpiresAt, userId } = useAuthStore();

  // 배지 텍스트 결정
  const badgeText = (() => {
    if (entitlement === 'premium') return 'Premium';
    if (entitlement === 'trial' && trialExpiresAt) {
      const daysLeft = Math.ceil(
        (new Date(trialExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      return `D-${daysLeft}`;
    }
    return null; // 무료 유저: 배지 없음
  })();

  async function handleManageSubscription() {
    const url = await getManagementURL();
    if (url) {
      await Linking.openURL(url);
    } else {
      showToast('관리할 구독이 없어요');
    }
  }

  return (
    <View>
      {/* 계정 헤더: userId + 배지 */}
      <View style={styles.accountRow}>
        <Text style={styles.accountIcon}>👤</Text>
        <Text style={styles.accountId} numberOfLines={1}>
          {userId ?? '계정'}
        </Text>
        {badgeText !== null && (
          <View
            style={[
              styles.badge,
              entitlement === 'premium' ? styles.badgePremium : styles.badgeTrial,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                entitlement === 'premium' ? styles.badgeTextLight : styles.badgeTextDark,
              ]}
            >
              {badgeText}
            </Text>
          </View>
        )}
      </View>

      <Divider />

      {/* 구독 관리: Premium/Trial 유저에게만 노출 */}
      {entitlement !== 'free' && entitlement !== null && (
        <SettingsRow
          label="구독 관리"
          onPress={handleManageSubscription}
          accessibilityLabel="구독 관리 — 앱스토어에서 변경"
        />
      )}

      {/* 플랜 업그레이드: 무료/Trial 유저에게 노출 */}
      {entitlement !== 'premium' && (
        <SettingsRow
          label="플랜 업그레이드"
          onPress={() => mainNavigation.navigate('Subscribe')}
          highlighted={entitlement === 'free' || entitlement === null}
          accessibilityLabel="플랜 업그레이드"
        />
      )}
    </View>
  );
}

// ─── S16SettingsScreen (메인 화면) ────────────────────────────────────────────

export default function S16SettingsScreen() {
  const { clearAuth } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState<'voice' | 'tracks' | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 루트 네비게이터 (Auth 스택으로 이동)
  const rootNavigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Main 스택 네비게이터 (Subscribe 화면으로 이동)
  const mainNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  // ─── 토스트 ────────────────────────────────────────────────────────────────

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

  // ─── 로그아웃 ──────────────────────────────────────────────────────────────

  async function handleLogout() {
    const confirmed = await showConfirmDialog('로그아웃할까요?');
    if (!confirmed) return;

    try {
      await revenueCatLogout();
    } catch {
      // RevenueCat 실패해도 앱 세션은 초기화
    }
    clearAuth();
    rootNavigation.navigate('Auth');
  }

  // ─── 계정 탈퇴 ────────────────────────────────────────────────────────────

  async function handleDeleteAccount() {
    const confirmed1 = await showConfirmDialog(
      '계정을 탈퇴할까요?',
      '모든 데이터가 삭제됩니다',
    );
    if (!confirmed1) return;

    const confirmed2 = await showConfirmDialog(
      '정말 삭제할까요?',
      '되돌릴 수 없어요',
    );
    if (!confirmed2) return;

    try {
      await deleteAccountAPI();
      await revenueCatLogout();
      clearAuth();
      rootNavigation.navigate('Auth');
    } catch {
      showToast('탈퇴 처리에 실패했어요');
    }
  }

  // ─── 목소리 샘플 삭제 ─────────────────────────────────────────────────────

  async function handleDeleteVoiceSamples() {
    const confirmed = await showConfirmDialog('목소리 샘플을 삭제할까요?');
    if (!confirmed) return;

    setIsDeleting('voice');
    try {
      await deleteVoiceSamplesAPI();
      showToast('삭제했어요');
    } catch {
      showToast('삭제에 실패했어요');
    } finally {
      setIsDeleting(null);
    }
  }

  // ─── 생성 음원 삭제 (MVP: 전체 삭제) ─────────────────────────────────────

  async function handleDeleteTracks() {
    const confirmed = await showConfirmDialog('전부 삭제할까요?', '되돌릴 수 없어요');
    if (!confirmed) return;

    setIsDeleting('tracks');
    try {
      await deleteAllTracksAPI();
      showToast('삭제했어요');
    } catch {
      showToast('삭제에 실패했어요');
    } finally {
      setIsDeleting(null);
    }
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 계정 + 구독 섹션 */}
        <SubscriptionSection
          mainNavigation={mainNavigation}
          showToast={showToast}
        />

        <Divider />

        {/* 알림 */}
        <SettingsRow
          label="알림 설정"
          onPress={() => Linking.openSettings()}
          accessibilityLabel="알림 설정"
        />

        <Divider />

        {/* 데이터 관리 */}
        <SettingsRow
          label="목소리 샘플 삭제"
          onPress={handleDeleteVoiceSamples}
          isLoading={isDeleting === 'voice'}
          disabled={isDeleting !== null && isDeleting !== 'voice'}
          accessibilityLabel="목소리 샘플 삭제"
        />
        <SettingsRow
          label="생성 음원 삭제"
          onPress={handleDeleteTracks}
          isLoading={isDeleting === 'tracks'}
          disabled={isDeleting !== null && isDeleting !== 'tracks'}
          accessibilityLabel="생성 음원 전체 삭제"
        />
        <SettingsRow
          label="계정 탈퇴"
          onPress={handleDeleteAccount}
          destructive
          accessibilityLabel="계정 탈퇴"
        />

        <Divider />

        {/* 법적 */}
        <SettingsRow
          label="개인정보처리방침"
          onPress={() => Linking.openURL(PRIVACY_URL)}
          accessibilityLabel="개인정보처리방침"
        />
        <SettingsRow
          label="이용약관"
          onPress={() => Linking.openURL(TERMS_URL)}
          accessibilityLabel="이용약관"
        />

        <Text style={styles.version}>버전 {APP_VERSION}</Text>

        <Divider />

        {/* 로그아웃 */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          accessibilityLabel="로그아웃"
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>

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
  },

  // 헤더
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1D35',
  },
  headerTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
  },

  // 스크롤
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // 계정 행
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  accountIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  accountId: {
    flex: 1,
    color: '#F5F5F5',
    fontSize: 14,
    marginRight: 8,
  },

  // 배지
  badge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgePremium: {
    backgroundColor: '#4A6FFF',
  },
  badgeTrial: {
    backgroundColor: '#F5C97A',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextLight: {
    color: '#FFFFFF',
  },
  badgeTextDark: {
    color: '#12152B',
  },

  // 구분선
  divider: {
    height: 1,
    backgroundColor: '#1A1D35',
    marginVertical: 4,
  },

  // 설정 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 52,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowLabel: {
    color: '#E0E2F0',
    fontSize: 15,
  },
  rowLabelHighlighted: {
    color: '#F5C97A',
    fontWeight: '600',
  },
  rowLabelDestructive: {
    color: '#FF5C5C',
  },
  rowChevron: {
    color: '#4A4E68',
    fontSize: 18,
  },

  // 버전
  version: {
    color: '#4A4E68',
    fontSize: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  // 로그아웃 버튼
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  logoutText: {
    color: '#7B80A0',
    fontSize: 15,
  },

  // 토스트
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
