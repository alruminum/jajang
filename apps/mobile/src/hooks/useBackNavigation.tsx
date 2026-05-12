/**
 * useBackNavigation — S13 뒤로가기 분기 훅
 *
 * 커버 스토리: Story 1 (재생 화면 컨트롤 — 뒤로가기), Story 3 (백그라운드 재생 — entitlement 분기)
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/05-app-back-navigation-policy.md
 *
 * 분기 정책:
 * - Premium/Trial + 재생 중: 재생 유지 + S06 이동
 * - 무료 + 재생 중: "재생을 중단할까요?" 다이얼로그 노출
 * - 무료 + 일시정지: 다이얼로그 없이 S06 이동
 * - Android 하드웨어 백: 위와 동일 분기 적용
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  BackHandler,
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { stopPlayback } from '@audio/AudioEngine';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface UseBackNavigationParams {
  entitlement: 'free' | 'trial' | 'premium';
  isPlaying: boolean;
}

interface UseBackNavigationReturn {
  handleBack: () => void;              // 헤더 ← 버튼 / Android BackHandler
  confirmDialog: React.ReactElement;   // 무료 유저 확인 다이얼로그 (pre-rendered JSX)
}

// ─── 훅 ───────────────────────────────────────────────────────────────────────

export function useBackNavigation({
  entitlement,
  isPlaying,
}: UseBackNavigationParams): UseBackNavigationReturn {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList, 'Play'>>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleBack = useCallback(() => {
    if (entitlement === 'premium' || entitlement === 'trial') {
      // Premium/Trial: 재생 유지 + S06 이동 (C06 미니 플레이어 표시는 impl/04 S06에서 자동)
      navigation.navigate('HomeTabs');
    } else {
      // 무료: 재생 중이면 확인 다이얼로그, 일시정지 상태면 그냥 이동
      if (isPlaying) {
        setShowConfirm(true);
      } else {
        navigation.navigate('HomeTabs');
      }
    }
  }, [entitlement, isPlaying, navigation]);

  const handleConfirmStop = useCallback(() => {
    setShowConfirm(false);
    stopPlayback().catch((err) =>
      console.error('[useBackNavigation] stopPlayback failed:', err),
    );
    navigation.navigate('HomeTabs');
  }, [navigation]);

  const handleCancelStop = useCallback(() => {
    setShowConfirm(false);
    // 재생 유지, 화면 유지
  }, []);

  // Android 하드웨어 백 버튼 — 기본 동작(앱 종료) 차단 후 동일 분기 처리
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  // pre-rendered JSX — 훅 내부 컴포넌트 선언 안티패턴 방지
  // (훅 내부에서 React.FC를 선언하면 매 렌더마다 새 타입이 생성되어 unmount→remount 반복)
  const confirmDialog = (
    <Modal visible={showConfirm} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>재생을 중단할까요?</Text>
          <Text style={styles.dialogBody}>
            화면을 나가면 자장가가 멈춰요
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleCancelStop}
              style={styles.cancelBtn}
              accessibilityLabel="재생 유지"
            >
              <Text style={styles.cancelText}>계속 들을게요</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmStop}
              style={styles.confirmBtn}
              accessibilityLabel="재생 중단하고 나가기"
            >
              <Text style={styles.confirmText}>중단할게요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return { handleBack, confirmDialog };
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  dialogTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  dialogBody: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmText: {
    color: colors.bgPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
