import React, { useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { Song } from '@services/api/songs';
import { useTheme } from '@hooks/useTheme';

interface SongListItemProps {
  song: Song;
  isSelected: boolean;
  isPreviewPlaying: boolean;
  isPreviewLoading: boolean;
  onSelect: () => void;
  onPreviewToggle: () => void;
}

export function SongListItem({
  song,
  isSelected,
  isPreviewPlaying,
  isPreviewLoading,
  onSelect,
  onPreviewToggle,
}: SongListItemProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    itemSelected: {
      borderColor: colors.accentPrimary,
    },
    info: { flex: 1 },
    titleKo: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'NotoSansKR-Regular',
      marginBottom: 2,
    },
    composer: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    previewBtn: {
      width: 36,
      height: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewIcon: {
      color: colors.accentSecondary,
      fontSize: 18,
    },
  }), [colors]);

  return (
    <Pressable
      style={[styles.item, isSelected && styles.itemSelected]}
      onPress={onSelect}
      accessibilityLabel={`${song.title_ko} 선택`}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={styles.info}>
        <Text style={styles.titleKo}>{song.title_ko}</Text>
        <Text style={styles.composer}>{song.composer}</Text>
      </View>

      {/* 미리듣기 버튼 */}
      <Pressable
        style={styles.previewBtn}
        onPress={(e) => {
          e.stopPropagation(); // 곡 선택 이벤트와 분리
          onPreviewToggle();
        }}
        accessibilityLabel={isPreviewPlaying ? `${song.title_ko} 미리듣기 정지` : `${song.title_ko} 미리듣기`}
        hitSlop={8}
      >
        {isPreviewLoading
          ? <ActivityIndicator size="small" color={colors.accentPrimary} />
          : <Text style={styles.previewIcon}>{isPreviewPlaying ? '⏸' : '▷'}</Text>
        }
      </Pressable>
    </Pressable>
  );
}
