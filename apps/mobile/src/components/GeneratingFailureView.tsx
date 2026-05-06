// apps/mobile/src/components/GeneratingFailureView.tsx
// DSP 실패 시 재시도 버튼 + 에러 메시지 + 홈 이동 버튼
// impl/07 §1

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  error: string;
  onRetry: () => void;
  onHome: () => void;
}

export default function GeneratingFailureView({ error, onRetry, onHome }: Props) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: {
    color: '#EEF0F8',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorText: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  retryBtn: {
    height: 52,
    backgroundColor: '#5A7AA8',
    borderRadius: 26,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  retryBtnText: { color: '#0D0F1A', fontSize: 16 },
  homeLink: { color: '#C49A8A', fontSize: 15, textDecorationLine: 'underline' },
});
