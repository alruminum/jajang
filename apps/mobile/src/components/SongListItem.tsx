import React from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import type { Song } from '@services/api/songs';

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
          ? <ActivityIndicator size="small" color="#F5C97A" />
          : <Text style={styles.previewIcon}>{isPreviewPlaying ? '⏸' : '▷'}</Text>
        }
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',      // 미선택 시 투명 테두리
  },
  itemSelected: {
    borderColor: '#F5C97A',          // 앰버 테두리 (선택)
  },
  info: { flex: 1 },
  titleKo: {
    color: '#EEF0F8',
    fontSize: 16,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 2,
  },
  composer: {
    color: '#7B80A0',
    fontSize: 13,
  },
  previewBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIcon: {
    color: '#8BAED4',
    fontSize: 18,
  },
});
