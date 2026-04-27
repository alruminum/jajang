// apps/mobile/src/components/TrackCard.tsx

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { TrackItem } from '@services/api/tracks'

interface Props {
  track:            TrackItem
  onPlay:           (track: TrackItem) => void
  onRetryPending?:  (track: TrackItem) => void   // 생성 중 카드 탭 → S12 복귀
  onDelete:         (track: TrackItem) => void
}

export function TrackCard({ track, onPlay, onRetryPending, onDelete }: Props) {
  const isCompleted = track.status === 'completed'
  const isPending   = track.status === 'pending' || track.status === 'processing'
  const isFailed    = track.status === 'failed'

  const handlePress = () => {
    if (isCompleted) onPlay(track)
    else if (isPending && onRetryPending) onRetryPending(track)
    // failed: 롱탭 → 삭제만 허용 (재생 불가)
  }

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isPending && styles.cardPending,
      ]}
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
      {/* 아이콘 영역 */}
      <View style={[styles.iconWrap, isPending && styles.iconWrapPending]}>
        <Text style={styles.icon}>
          {isPending ? '…' : isFailed ? '⚠' : '♫'}
        </Text>
      </View>

      {/* 텍스트 영역 */}
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

      {/* 우측 액션 */}
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

const styles = StyleSheet.create({
  card:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1D30', borderRadius: 16, padding: 16, marginBottom: 10 },
  cardPending:     { opacity: 0.8, borderWidth: 1, borderColor: '#2A2E48' },
  iconWrap:        { width: 44, height: 44, borderRadius: 12, backgroundColor: '#21253E', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  iconWrapPending: { backgroundColor: '#1A1D30', borderWidth: 1, borderColor: '#2A2E48' },
  icon:            { color: '#C49A8A', fontSize: 20 },
  textWrap:        { flex: 1 },
  songName:        { color: '#EEF0F8', fontSize: 16, fontFamily: 'NotoSansKR-Regular', marginBottom: 4 },
  subText:         { color: '#7B80A0', fontSize: 13 },
  playBtn:         { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  playIcon:        { color: '#5A7AA8', fontSize: 18 },
})
