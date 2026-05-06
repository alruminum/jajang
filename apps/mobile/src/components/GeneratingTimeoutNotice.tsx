// apps/mobile/src/components/GeneratingTimeoutNotice.tsx
// 30초 경과 후 "처리 중 (재시도 대기)" 안내 + 홈 이동 버튼
// impl/07 §1

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  onHome: () => void;
}

export default function GeneratingTimeoutNotice({ onHome }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{'⏳'}</Text>
      <Text style={styles.title}>처리 중{'\n'}(재시도 대기)</Text>
      <Text style={styles.subtitle}>
        DSP 서버가 처리 중이에요.{'\n'}
        완료되면 홈 화면에서 확인할 수 있어요.
      </Text>
      <Pressable
        style={styles.homeBtn}
        onPress={onHome}
        accessibilityLabel="홈으로 이동"
      >
        <Text style={styles.homeBtnText}>홈으로 이동</Text>
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
    lineHeight: 32,
    marginBottom: 12,
  },
  subtitle: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  homeBtn: {
    height: 52,
    backgroundColor: '#5A7AA8',
    borderRadius: 26,
    paddingHorizontal: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeBtnText: { color: '#0D0F1A', fontSize: 16 },
});
