// apps/mobile/src/components/GeneratingFailureView.tsx
// DSP 실패 시 재시도 버튼 + 에러 메시지 + 홈 이동 버튼
// impl/07 §1

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';

interface Props {
  error: string;
  onRetry: () => void;
  onHome: () => void;
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  retryBtn: {
    height: 52,
    backgroundColor: colors.accentPrimary,
    borderRadius: 26,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  retryBtnText: { color: colors.bgPrimary, fontSize: 16 },
  homeLink: { color: colors.accentSecondary, fontSize: 15, textDecorationLine: 'underline' },
});

export default function GeneratingFailureView({ error, onRetry, onHome }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{'😔'}</Text>
      <Text style={styles.title}>생성에 실패했어요</Text>
      <Text style={styles.errorText}>{error}</Text>
      <Pressable
        style={styles.retryBtn}
        onPress={onRetry}
        accessibilityLabel="다시 시도"
      >
        <Text style={styles.retryBtnText}>다시 시도</Text>
      </Pressable>
      <Pressable
        onPress={onHome}
        accessibilityLabel="홈으로 이동"
      >
        <Text style={styles.homeLink}>홈으로 이동하기</Text>
      </Pressable>
    </View>
  );
}
