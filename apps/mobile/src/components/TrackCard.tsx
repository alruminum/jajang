// apps/mobile/src/components/TrackCard.tsx

import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { TrackItem } from '@services/api/tracks'
import { useTheme } from '@hooks/useTheme'

interface Props {
  track:            TrackItem
  onPlay:           (track: TrackItem) => void
  onRetryPending?:  (track: TrackItem) => void
  onDelete:         (track: TrackItem) => void
}

export function TrackCard({ track, onPlay, onRetryPending, onDelete }: Props) {
  const { colors } = useTheme()
  const isCompleted = track.status === 'completed'
  const isPending   = track.status === 'pending' || track.status === 'processing'
  const isFailed    = track.status === 'failed'

  const styles = useMemo(() => StyleSheet.create({
    card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 10 },
    cardPending:     { opacity: 0.8, borderWidth: 1, borderColor: colors.border },
    iconWrap:        { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceHigh, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    iconWrapPending: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    icon:            { color: colors.accentPrimary, fontSize: 20 },
    textWrap:        { flex: 1 },
    songName:        { color: colors.textPrimary, fontSize: 16, fontFamily: 'NotoSansKR-Regular', marginBottom: 4 },
    subText:         { color: colors.textSecondary, fontSize: 13 },
    playBtn:         { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    playIcon:        { color: colors.accentPrimary, fontSize: 18 },
  }), [colors])

  const handlePress = () => {
    if (isCompleted) onPlay(track)
    else if (isPending && onRetryPending) onRetryPending(track)
  }

  return (
    <TouchableOpacity
      style={[styles.card, isPending && styles.cardPending]}
      activeOpacity={0.7}
      onPress={handlePress}
      onLongPress={() => onDelete(track)}
      accessibilityLabel={
        isCompleted ? `${track.song_name} 재생` :
        isPending   ? `${track.song_name} 생성 중` :
        `${track.song_name} 생성 실패`
      }
      accessibilityHint={
        isCompleted ? '탭해서 재생하세요' :
        isPending   ? '탭해서 생성 상태를 확인하세요' :
        '길게 눌러서 삭제하세요'
      }
    >
      <View style={[styles.iconWrap, isPending && styles.iconWrapPending]}>
        <Text style={styles.icon}>
          {isPending ? '…' : isFailed ? '⚠' : '♫'}
        </Text>
      </View>

      <View style={styles.textWrap}>
        <Text style={styles.songName} numberOfLines={1}>
          {track.song_name}
        </Text>
        <Text style={styles.subText}>
          {isPending
            ? '만들고 있어요…'
            : isFailed
            ? '생성에 실패했어요'
            : formatDate(track.completed_at ?? track.created_at)}
        </Text>
      </View>

      {isCompleted && (
        <TouchableOpacity
          style={styles.playBtn}
          onPress={() => onPlay(track)}
          hitSlop={8}
          accessibilityLabel="재생"
        >
          <Text style={styles.playIcon}>▶</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
