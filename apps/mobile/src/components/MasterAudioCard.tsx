// apps/mobile/src/components/MasterAudioCard.tsx
// 완료된 MasterAudio 카드 (impl/05)

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { SONG_NAMES } from '@services/songs';

interface Props {
  songKey: string;
  completedAt: string;   // ISO
  onPlay: () => void;
}

export default function MasterAudioCard({ songKey, completedAt, onPlay }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 16,
          marginHorizontal: 20,
          marginBottom: 10,
        },
        iconWrap: {
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: colors.surfaceHigh,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 14,
        },
        icon: { color: colors.accentSecondary, fontSize: 20 },
        textWrap: { flex: 1 },
        songName: { color: colors.textPrimary, fontSize: 16, marginBottom: 4 },
        dateText: { color: colors.textSecondary, fontSize: 13 },
        playBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
        playIcon: { color: colors.accentPrimary, fontSize: 18 },
      }),
    [colors],
  );

  const displayName = SONG_NAMES[songKey] ?? songKey;
  const formattedDate = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
  }).format(new Date(completedAt));

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPlay}
      accessibilityLabel={`${displayName} 재생`}
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>♫</Text>
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.songName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.dateText}>{formattedDate}</Text>
      </View>

      <TouchableOpacity
        style={styles.playBtn}
        onPress={onPlay}
        hitSlop={8}
        accessibilityLabel="재생"
      >
        <Text style={styles.playIcon}>▶</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
