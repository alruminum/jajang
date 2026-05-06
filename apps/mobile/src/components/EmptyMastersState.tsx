// apps/mobile/src/components/EmptyMastersState.tsx
// 완료된 MasterAudio 없을 때 빈 상태 컴포넌트 (impl/05)

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@hooks/useTheme';

interface Props {
  onCta: () => void;
}

export default function EmptyMastersState({ onCta }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 40,
        },
        emoji: { fontSize: 56, marginBottom: 24 },
        title: {
          color: colors.textPrimary,
          fontSize: 18,
          fontWeight: '600',
          marginBottom: 8,
          textAlign: 'center',
        },
        subtitle: {
          color: colors.textSecondary,
          fontSize: 14,
          marginBottom: 32,
          textAlign: 'center',
        },
        btn: {
          height: 52,
          borderRadius: 26,
          backgroundColor: colors.accentPrimary,
          paddingHorizontal: 28,
          alignItems: 'center',
          justifyContent: 'center',
        },
        btnText: { color: colors.bgPrimary, fontSize: 15, fontWeight: '600' },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎵</Text>
      <Text style={styles.title}>아직 자장가가 없어요</Text>
      <Text style={styles.subtitle}>목소리를 담아볼까요?</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={onCta}
        accessibilityRole="button"
        accessibilityLabel="자장가 만들기"
      >
        <Text style={styles.btnText}>자장가 만들기</Text>
      </TouchableOpacity>
    </View>
  );
}
