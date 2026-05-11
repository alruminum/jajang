/**
 * S16 — 설정 화면 (SettingsScreen)
 *
 * 커버 스토리: Epic 05 Story 1 (구독 취소 딥링크 + 복원), Story 5 (구독 진입점), UX Flow S16
 *             Epic 06 Story 1 (목소리 샘플 삭제), Story 2 (생성 음원 삭제)
 * impl: docs/milestones/v1/epics/epic-06-privacy/impl/03-app-settings-screen-extended.md
 *
 * 모듈 경계:
 * - S16 → revenue-cat.ts: getManagementURL, revenueCatLogout
 * - S16 → @store: useAuthStore (email, entitlement, trialExpiresAt / clearSession)
 * - S16 → @store/generationSlice: useGenerationStore (tracks)
 * - S16 → @services/dataManagementApi: getVoiceSampleStatus, deleteVoiceSample
 * - S16 → @components/DeleteTracksSheet: 음원 목록 삭제 시트
 * - S16 → @utils/dialog: showConfirmDialog
 * - S16 → @utils/toast: showToast
 * - navigation.navigate('Subscribe', { source: 'settings' }) — 업그레이드 CTA
 * - navigation.navigate('Login') — 로그아웃 후
 * - navigation.navigate('AccountDeletionFlow') — 계정 탈퇴 (impl/04)
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';

import { useAuthStore } from '@store';
import { useThemeStore } from '@store/theme-store';
import type { ThemePref } from '@store/theme-store';
import { getManagementURL, revenueCatLogout } from '@services/revenue-cat';
import {
  getVoiceSampleStatus,
  deleteVoiceSample,
  VoiceSampleStatus,
} from '@services/dataManagementApi';
import { useGenerationStore } from '@store/generationSlice';
import { DeleteTracksSheet } from '@components/DeleteTracksSheet';
import { showConfirmDialog } from '@utils/dialog';
import { showToast } from '@utils/toast';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const APP_VERSION = '1.0.0';

// ─── makeStyles factory ───────────────────────────────────────────────────────

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
    },

    // 헤더
    header: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surface,
    },
    headerTitle: {
      color: colors.textHighlight,
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
      color: colors.textHighlight,
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
      backgroundColor: colors.interactive,
    },
    badgeTrial: {
      backgroundColor: colors.accentPrimary,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    badgeTextLight: {
      color: colors.textOnAccent,
    },
    badgeTextDark: {
      color: colors.bgDeep,
    },

    // 구분선
    divider: {
      height: 1,
      backgroundColor: colors.surface,
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
      color: colors.textBodyHigh,
      fontSize: 15,
    },
    rowLabelHighlighted: {
      color: colors.accentPrimary,
      fontWeight: '600',
    },
    rowLabelDestructive: {
      color: colors.destructive,
    },
    rowLabelMuted: {
      color: colors.textMuted,
    },
    rowSubLabel: {
      color: colors.textMuted,
      fontSize: 13,
    },
    rowChevron: {
      color: colors.textMuted,
      fontSize: 18,
    },

    // 버전
    version: {
      color: colors.textMuted,
      fontSize: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },

    // 테마 섹션
    themeSectionHeader: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    themeSectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 12,
      minHeight: 48,
    },
    themeRowLabel: {
      color: colors.textBodyHigh,
      fontSize: 15,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterSelected: {
      borderColor: colors.accentPrimary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.accentPrimary,
    },

    // 로그아웃 버튼
    logoutBtn: {
      marginHorizontal: 20,
      marginTop: 8,
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    logoutText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
  });

// ─── SettingsRow 컴포넌트 ─────────────────────────────────────────────────────

interface SettingsRowProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  highlighted?: boolean;   // 강조 스타일 (무료 유저 업그레이드 CTA)
  destructive?: boolean;   // 빨간 텍스트 (계정 탈퇴)
  isLoading?: boolean;     // 인라인 스피너 (삭제 진행 중)
  disabled?: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorTokens;
}

function SettingsRow({
  label,
  onPress,
  accessibilityLabel,
  highlighted = false,
  destructive = false,
  isLoading = false,
  disabled = false,
  styles,
  colors,
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
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Text style={styles.rowChevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return <View style={styles.divider} />;
}

// ─── SubscriptionSection ──────────────────────────────────────────────────────

interface SubscriptionSectionProps {
  navigation: NavigationProp<ParamListBase>;
  styles: ReturnType<typeof makeStyles>;
  colors: ColorTokens;
}

function SubscriptionSection({ navigation, styles, colors }: SubscriptionSectionProps) {
  const email = useAuthStore((s) => s.email);
  const entitlement = useAuthStore((s) => s.entitlement);
  const trialExpiresAt = useAuthStore((s) => s.trialExpiresAt);

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
      {/* 계정 헤더: 이메일 + 배지 */}
      <View style={styles.accountRow}>
        <Text style={styles.accountIcon}>👤</Text>
        <Text style={styles.accountId} numberOfLines={1}>
          {email ?? '계정'}
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

      <Divider styles={styles} />

      {/* 구독 관리: Premium/Trial 유저에게만 노출 */}
      {entitlement !== 'free' && entitlement !== null && (
        <SettingsRow
          label="구독 관리"
          onPress={handleManageSubscription}
          accessibilityLabel="구독 관리 — 앱스토어에서 변경"
          styles={styles}
          colors={colors}
        />
      )}

      {/* 플랜 업그레이드: 무료/Trial 유저에게 노출 */}
      {entitlement !== 'premium' && (
        <SettingsRow
          label="플랜 업그레이드"
          onPress={() => navigation.navigate('Subscribe', { source: 'settings' })}
          highlighted={entitlement === 'free' || entitlement === null}
          accessibilityLabel="플랜 업그레이드"
          styles={styles}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── ThemeSection (S16 테마 토글) ────────────────────────────────────────────

const THEME_OPTIONS: { label: string; value: ThemePref }[] = [
  { label: '시스템 설정 따라가기', value: 'system' },
  { label: '다크 모드', value: 'dark' },
  { label: '라이트 모드', value: 'light' },
];

interface ThemeSectionProps {
  styles: ReturnType<typeof makeStyles>;
}

function ThemeSection({ styles }: ThemeSectionProps) {
  const pref = useThemeStore((s) => s.pref);
  const setPref = useThemeStore((s) => s.setPref);

  return (
    <View>
      <View style={styles.themeSectionHeader}>
        <Text style={styles.themeSectionTitle}>테마</Text>
      </View>
      {THEME_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={styles.themeRow}
          onPress={() => setPref(opt.value)}
          accessibilityLabel={opt.label}
          accessibilityRole="radio"
          accessibilityState={{ checked: pref === opt.value }}
        >
          <View
            style={[
              styles.radioOuter,
              pref === opt.value && styles.radioOuterSelected,
            ]}
          >
            {pref === opt.value && (
              <View testID="s16-radio-inner" style={styles.radioInner} />
            )}
          </View>
          <Text style={styles.themeRowLabel}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── S16SettingsScreen (메인 화면) ────────────────────────────────────────────

interface S16SettingsScreenProps {
  navigation: NavigationProp<ParamListBase>;
}

export default function S16SettingsScreen({ navigation }: S16SettingsScreenProps) {
  const [sampleStatus, setSampleStatus] = useState<VoiceSampleStatus | null>(null);
  const [isSampleDeleting, setIsSampleDeleting] = useState(false);
  const [isTracksSheetOpen, setIsTracksSheetOpen] = useState(false);
  const tracks = useGenerationStore((s) => s.tracks);

  // useTheme — 색상 토큰 (기존 useThemeStore 와 별도, §3.5)
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // ─── 진입 시 샘플 상태 조회 ───────────────────────────────────────────────

  useEffect(() => {
    getVoiceSampleStatus()
      .then(setSampleStatus)
      .catch(() => {
        // API 실패 시 null 유지 → 버튼 기본 활성 상태
      });
  }, []);

  // ─── 로그아웃 ──────────────────────────────────────────────────────────────

  async function handleLogout() {
    const confirmed = await showConfirmDialog('로그아웃할까요?');
    if (!confirmed) return;

    try {
      await revenueCatLogout();
    } catch {
      // RevenueCat 실패해도 앱 세션은 초기화
    }
    useAuthStore.getState().clearSession();
    navigation.navigate('Login');
  }

  // ─── 계정 탈퇴 — AccountDeletionFlow (impl/04) 진입 ─────────────────────

  function handleDeleteAccount() {
    navigation.navigate('AccountDeletionFlow');
  }

  // ─── 목소리 샘플 삭제 (Alert.alert 1단계 확인) ────────────────────────────

  function handleDeleteVoiceSample() {
    Alert.alert(
      '목소리 샘플 삭제',
      '삭제하면 복구할 수 없어요. 목소리 샘플을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제할게요',
          style: 'destructive',
          onPress: async () => {
            setIsSampleDeleting(true);
            try {
              await deleteVoiceSample();
              setSampleStatus({ hasSample: false, sampleStatus: 'deleted' });
              showToast('삭제했어요');
            } catch {
              showToast('삭제 중 문제가 생겼어요. 다시 시도해주세요.');
            } finally {
              setIsSampleDeleting(false);
            }
          },
        },
      ],
    );
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  const hasSampleDeleted = sampleStatus !== null && sampleStatus.hasSample === false;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View testID="s16-container" style={styles.container}>
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
          <SubscriptionSection navigation={navigation} styles={styles} colors={colors} />

          <Divider styles={styles} />

          {/* 알림 */}
          <SettingsRow
            label="알림 설정"
            onPress={() => Linking.openSettings()}
            accessibilityLabel="알림 설정"
            styles={styles}
            colors={colors}
          />

          <Divider styles={styles} />

          {/* 테마 */}
          <ThemeSection styles={styles} />

          <Divider styles={styles} />

          {/* 데이터 관리 */}
          {hasSampleDeleted ? (
            /* 이미 삭제됨 — 비활성 상태 */
            <View style={styles.row}>
              <Text style={[styles.rowLabel, styles.rowLabelMuted]}>목소리 샘플 삭제</Text>
              <Text style={styles.rowSubLabel}>이미 삭제되었어요</Text>
            </View>
          ) : (
            <SettingsRow
              label="목소리 샘플 삭제"
              onPress={handleDeleteVoiceSample}
              isLoading={isSampleDeleting}
              accessibilityLabel="목소리 샘플 삭제"
              styles={styles}
              colors={colors}
            />
          )}

          <SettingsRow
            label="생성 음원 삭제"
            onPress={() => setIsTracksSheetOpen(true)}
            disabled={tracks.length === 0}
            accessibilityLabel="생성 음원 삭제"
            styles={styles}
            colors={colors}
          />

          <SettingsRow
            label="계정 탈퇴"
            onPress={handleDeleteAccount}
            destructive
            accessibilityLabel="계정 탈퇴"
            styles={styles}
            colors={colors}
          />

          <Divider styles={styles} />

          {/* 법적 */}
          <SettingsRow
            label="개인정보처리방침"
            onPress={() => navigation.navigate('Legal')}
            accessibilityLabel="개인정보처리방침"
            styles={styles}
            colors={colors}
          />
          <SettingsRow
            label="이용약관"
            onPress={() => navigation.navigate('Legal')}
            accessibilityLabel="이용약관"
            styles={styles}
            colors={colors}
          />

          <Text style={styles.version}>버전 {APP_VERSION}</Text>

          <Divider styles={styles} />

          {/* 로그아웃 */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            accessibilityLabel="로그아웃"
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* 생성 음원 삭제 시트 */}
        {isTracksSheetOpen && (
          <DeleteTracksSheet
            tracks={tracks}
            onClose={() => setIsTracksSheetOpen(false)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
