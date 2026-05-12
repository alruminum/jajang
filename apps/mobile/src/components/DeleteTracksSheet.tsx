/**
 * DeleteTracksSheet — 생성 음원 개별/전체 삭제 바텀 시트
 *
 * 커버 스토리: Epic 06 Story 2 (생성 음원 삭제)
 * impl: docs/milestones/v1/epics/epic-06-privacy/impl/03-app-settings-screen-extended.md
 *
 * 모듈 경계:
 * - DeleteTracksSheet → dataManagementApi: deleteTrack, deleteAllTracks
 * - DeleteTracksSheet → generationSlice: removeTrack, clearAllTracks
 * - DeleteTracksSheet → AsyncStorage: 오프라인 삭제 큐 (jajang:offline_deletions)
 * - S16SettingsScreen → DeleteTracksSheet: tracks, onClose
 */

import React, { useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Track } from '@services/dataManagementApi'
import { deleteTrack, deleteAllTracks } from '@services/dataManagementApi'
import { useGenerationStore } from '@store/generationSlice'
import { showToast } from '@utils/toast'
import { useTheme } from '@hooks/useTheme'
import type { ColorTokens } from '../theme/tokens'

// ─── 오프라인 삭제 큐 ──────────────────────────────────────────────────────────

const OFFLINE_DELETIONS_KEY = 'jajang:offline_deletions'
const MAX_QUEUE_SIZE = 50

interface OfflineDeletion {
  type: 'track'
  id: string
  enqueuedAt: string
}

async function enqueueOfflineDeletion(item: { type: 'track'; id: string }): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(OFFLINE_DELETIONS_KEY)
    const queue: OfflineDeletion[] = existing ? JSON.parse(existing) : []
    queue.push({ ...item, enqueuedAt: new Date().toISOString() })
    // 최대 50개 유지 — 초과 시 오래된 것 제거
    const trimmed = queue.slice(-MAX_QUEUE_SIZE)
    await AsyncStorage.setItem(OFFLINE_DELETIONS_KEY, JSON.stringify(trimmed))
  } catch {
    // 스토리지 오류는 무시
  }
}

function isNetworkError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const err = e as Record<string, unknown>
    const code = err['code']
    if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ECONNREFUSED') {
      return true
    }
    const message = typeof err['message'] === 'string' ? err['message'] : ''
    if (message.includes('Network Error') || message.includes('timeout')) {
      return true
    }
  }
  return false
}

// ─── 곡 키 레이블 변환 ────────────────────────────────────────────────────────

function songKeyToLabel(key: string): string {
  const map: Record<string, string> = {
    brahms: '브람스 자장가',
    mozart: '모차르트 자장가',
    schubert: '슈베르트 자장가',
    twinkle: '반짝반짝 작은 별',
    rockabye: '록어바이 베이비',
    hush: '허시 리틀 베이비',
  }
  return map[key] ?? key
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  tracks: Track[]
  onClose: () => void
}

// ─── DeleteTracksSheet ─────────────────────────────────────────────────────────

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trackName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
  },
  deleteBtn: {
    color: colors.successMuted,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  deleteAllBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 14,
    alignItems: 'center',
  },
  deleteAllText: {
    color: colors.errorText,
    fontSize: 16,
    fontWeight: '500',
  },
})

export function DeleteTracksSheet({ tracks, onClose }: Props) {
  const { removeTrack, clearAllTracks } = useGenerationStore()
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])

  // ─── 개별 삭제 (오프라인 대응) ────────────────────────────────────────────

  const handleDeleteSingle = useCallback(
    (track: Track) => {
      const label = songKeyToLabel(track.songKey)
      Alert.alert(`${label} 삭제`, '삭제하면 복구할 수 없어요. 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제할게요',
          style: 'destructive',
          onPress: async () => {
            // 1. 로컬 즉시 반영 (낙관적 업데이트)
            removeTrack(track.id)
            showToast('삭제했어요')

            // 2. 서버 삭제 시도 (백그라운드)
            try {
              await deleteTrack(track.id)
            } catch (e) {
              if (isNetworkError(e)) {
                await enqueueOfflineDeletion({ type: 'track', id: track.id })
              }
              // 서버 실패해도 로컬 삭제는 유지
            }
          },
        },
      ])
    },
    [removeTrack],
  )

  // ─── 전체 삭제 ───────────────────────────────────────────────────────────

  const handleDeleteAll = useCallback(() => {
    Alert.alert('전부 삭제할까요?', '되돌릴 수 없어요', [
      { text: '취소', style: 'cancel' },
      {
        text: '모두 삭제할게요',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAllTracks()
            clearAllTracks()
            showToast('모든 자장가를 삭제했어요')
            onClose()
          } catch {
            showToast('삭제 중 문제가 생겼어요. 다시 시도해주세요.')
          }
        },
      },
    ])
  }, [clearAllTracks, onClose])

  // ─── 렌더 ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* 반투명 배경 — 탭 시 닫기 */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="시트 닫기" />

      <View style={styles.sheet}>
        {/* 시트 헤더 */}
        <View style={styles.handle} />
        <Text style={styles.title}>생성 음원 관리</Text>

        {/* 음원 목록 */}
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.trackName}>{songKeyToLabel(item.songKey)}</Text>
              <TouchableOpacity
                onPress={() => handleDeleteSingle(item)}
                accessibilityLabel={`${songKeyToLabel(item.songKey)} 삭제`}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
              >
                <Text style={styles.deleteBtn}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>생성된 자장가가 없어요</Text>
          }
        />

        {/* 전체 삭제 CTA */}
        {tracks.length > 0 && (
          <TouchableOpacity
            style={styles.deleteAllBtn}
            onPress={handleDeleteAll}
            accessibilityLabel="모든 자장가 삭제"
          >
            <Text style={styles.deleteAllText}>모두 삭제하기</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  )
}

