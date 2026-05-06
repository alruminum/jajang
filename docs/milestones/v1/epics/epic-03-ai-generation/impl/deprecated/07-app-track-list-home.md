---
depth: std
design: skipped
---

# impl/07 — 앱: 홈 화면 트랙 목록 통합 (S06 확장)

**Epic**: 03 — AI 음원 생성  
**커버 스토리**: Story 5 (홈 화면 음원 목록), Story 1 (생성 완료 카드 + 생성 중 카드 → S12 복귀)  
**선행 조건**: impl/05 서버 완료 (GET /tracks), impl/06 완료 (generationSlice), Epic 01 impl/08 (HomeScreen 기존 구현)  
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── HomeScreen.tsx               [수정 — S06 트랙 목록 + 완료/생성 중 카드 통합]
├── services/
│   └── api/tracks.ts                [신규 — /tracks API 클라이언트]
├── components/
│   └── TrackCard.tsx                [신규 — 트랙 카드 (completed / pending / failed 상태)]
└── store/
    └── homeSlice.ts                 [수정 — lastHomeVisitAt 타임스탬프 추가]
```

---

## 2. tracks API 클라이언트

```typescript
// apps/mobile/src/services/api/tracks.ts

import { apiClient } from './client'

export interface TrackItem {
  id:            string
  job_id:        string
  song_key:      string
  song_name:     string
  status:        'completed' | 'pending' | 'processing' | 'failed'
  presigned_url: string | null
  created_at:    string    // ISO8601
  completed_at:  string | null
}

export interface TracksListResponse {
  tracks:                     TrackItem[]
  has_pending:                boolean
  completed_since_last_check: boolean
  total:                      number
}

export interface TrackDeleteResponse {
  id:      string
  deleted: boolean
}

export const tracksApi = {
  listTracks: (params?: {
    lastCheckedAt?: string    // ISO8601 (UTC)
    includePresigned?: boolean
  }): Promise<TracksListResponse> => {
    const query: Record<string, string> = {}
    if (params?.lastCheckedAt)   query.last_checked_at   = params.lastCheckedAt
    if (params?.includePresigned !== undefined)
      query.include_presigned = String(params.includePresigned)
    return apiClient.get('/tracks/', { params: query }).then(r => r.data)
  },

  deleteTrack: (trackId: string): Promise<TrackDeleteResponse> =>
    apiClient.delete(`/tracks/${trackId}`).then(r => r.data),
}
```

---

## 3. TrackCard 컴포넌트

```typescript
// apps/mobile/src/components/TrackCard.tsx

import React from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import type { TrackItem } from '../services/api/tracks'

interface Props {
  track:         TrackItem
  onPlay:        (track: TrackItem) => void
  onRetryPending?: (track: TrackItem) => void   // 생성 중 카드 탭 → S12 복귀
  onDelete:      (track: TrackItem) => void
}

export function TrackCard({ track, onPlay, onRetryPending, onDelete }: Props) {
  const isCompleted  = track.status === 'completed'
  const isPending    = track.status === 'pending' || track.status === 'processing'
  const isFailed     = track.status === 'failed'

  const handlePress = () => {
    if (isCompleted) onPlay(track)
    else if (isPending && onRetryPending) onRetryPending(track)
    // failed: 롱탭 → 삭제만 허용 (재생 불가)
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isPending && styles.cardPending,
        pressed && styles.cardPressed,
      ]}
      onPress={handlePress}
      onLongPress={() => onDelete(track)}
      accessibilityLabel={
        isCompleted ? `${track.song_name} 재생` :
        isPending   ? `${track.song_name} 생성 중` :
        `${track.song_name} 생성 실패`
      }
      accessibilityHint={
        isCompleted ? "탭해서 재생하세요" :
        isPending   ? "탭해서 생성 상태를 확인하세요" :
        "길게 눌러서 삭제하세요"
      }
    >
      {/* 아이콘 영역 */}
      <View style={[styles.iconWrap, isPending && styles.iconWrapPending]}>
        {isPending ? (
          <ActivityIndicator size="small" color="#F5C97A" />
        ) : (
          <Text style={styles.icon}>{isFailed ? '⚠' : '♫'}</Text>
        )}
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
        <Pressable
          style={styles.playBtn}
          onPress={() => onPlay(track)}
          hitSlop={8}
          accessibilityLabel="재생"
        >
          <Text style={styles.playIcon}>▶</Text>
        </Pressable>
      )}
    </Pressable>
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
  cardPressed:     { opacity: 0.7 },
  iconWrap:        { width: 44, height: 44, borderRadius: 12, backgroundColor: '#21253E', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  iconWrapPending: { backgroundColor: '#1A1D30', borderWidth: 1, borderColor: '#2A2E48' },
  icon:            { color: '#8BAED4', fontSize: 20 },
  textWrap:        { flex: 1 },
  songName:        { color: '#EEF0F8', fontSize: 16, fontFamily: 'NotoSansKR-Regular', marginBottom: 4 },
  subText:         { color: '#7B80A0', fontSize: 13 },
  playBtn:         { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  playIcon:        { color: '#F5C97A', fontSize: 18 },
})
```

---

## 4. HomeScreen 수정

```typescript
// apps/mobile/src/screens/HomeScreen.tsx (수정)

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, Pressable, StyleSheet, FlatList, Alert,
  Animated, AppState,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { tracksApi, TrackItem } from '../services/api/tracks'
import { TrackCard } from '../components/TrackCard'
import { useGenerationStore } from '../store/generationSlice'
import { useAuthStore } from '../store/authSlice'

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>

const LAST_HOME_VISIT_KEY = 'jajang:lastHomeVisitAt'

export function HomeScreen({ navigation }: Props) {
  const [tracks, setTracks]                       = useState<TrackItem[]>([])
  const [hasPending, setHasPending]               = useState(false)
  const [showCompletedCard, setShowCompletedCard]  = useState(false)
  const [completedTrack, setCompletedTrack]        = useState<TrackItem | null>(null)
  const [isLoading, setIsLoading]                  = useState(true)

  const { clearCompleted, completedJobId } = useGenerationStore()
  const { entitlement, generationCount }   = useAuthStore()
  const isFreeUser = entitlement === 'free'

  // "생성 완료 카드" pulse glow 애니메이션
  const pulseAnim = useRef(new Animated.Value(1)).current

  // 화면 포커스 시 트랙 목록 갱신
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadTracks()
    })
    return unsubscribe
  }, [navigation])

  const loadTracks = useCallback(async () => {
    setIsLoading(true)
    try {
      const lastVisit = await AsyncStorage.getItem(LAST_HOME_VISIT_KEY)
      const res = await tracksApi.listTracks({
        lastCheckedAt: lastVisit ?? undefined,
        includePresigned: true,
      })

      setTracks(res.tracks)
      setHasPending(res.has_pending)

      // 백그라운드 생성 완료 카드
      if (res.completed_since_last_check) {
        const newlyCompleted = res.tracks.find(t => t.status === 'completed')
        if (newlyCompleted) {
          setCompletedTrack(newlyCompleted)
          setShowCompletedCard(true)
          startPulseAnimation()
        }
      }

      // lastHomeVisitAt 업데이트
      await AsyncStorage.setItem(LAST_HOME_VISIT_KEY, new Date().toISOString())
    } catch (e) {
      // 에러 시 조용히 실패 — 기존 상태 유지
    } finally {
      setIsLoading(false)
    }
  }, [])

  const startPulseAnimation = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.03, duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.03, duration: 400, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
    ]).start()
  }

  const handlePlayTrack = (track: TrackItem) => {
    navigation.navigate('Play' as any, {
      trackId: track.id,
      presignUrl: track.presigned_url,
    })
  }

  const handleRetryPending = (track: TrackItem) => {
    // 생성 중 카드 탭 → S12 복귀 (동일 job_id로 재진입)
    navigation.navigate('Generating' as any, {
      sampleId: '',       // 이미 generation이 진행 중 — sampleId 불필요
      songKey: track.song_key,
      jobId: track.job_id,
    })
  }

  const handleDeleteTrack = (track: TrackItem) => {
    Alert.alert(
      '자장가를 삭제할까요?',
      `"${track.song_name}"을 삭제하면 되돌릴 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await tracksApi.deleteTrack(track.id)
              setTracks(prev => prev.filter(t => t.id !== track.id))
              if (completedTrack?.id === track.id) {
                setShowCompletedCard(false)
              }
            } catch {
              Alert.alert('삭제에 실패했어요', '잠시 후 다시 시도해주세요.')
            }
          },
        },
      ],
    )
  }

  const handleDismissCompletedCard = () => {
    setShowCompletedCard(false)
    setCompletedTrack(null)
    clearCompleted()
  }

  const completedTracks = tracks.filter(t => t.status === 'completed')
  const pendingTracks   = tracks.filter(t => t.status === 'pending' || t.status === 'processing')
  const failedTracks    = tracks.filter(t => t.status === 'failed')

  // 표시 순서: pending → completed (최신순) → failed
  const displayTracks = [...pendingTracks, ...completedTracks, ...failedTracks]

  const isEmpty = displayTracks.length === 0 && !isLoading

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.appName}>자장</Text>
        <Pressable
          onPress={() => navigation.navigate('Settings' as any)}
          accessibilityLabel="설정"
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {/* 생성 횟수 배지 (무료 유저만) */}
      {isFreeUser && (
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>생성 {generationCount}/3</Text>
        </View>
      )}

      {/* 생성 완료 카드 (백그라운드 완료 후 재진입) */}
      {showCompletedCard && completedTrack && (
        <Animated.View style={[styles.completedCard, { transform: [{ scale: pulseAnim }] }]}>
          <Pressable
            style={styles.completedCardInner}
            onPress={() => {
              handleDismissCompletedCard()
              handlePlayTrack(completedTrack)
            }}
            accessibilityLabel="새 자장가 완성! 들어보기"
          >
            <Text style={styles.completedCardTitle}>🎵 새 자장가 완성!</Text>
            <Text style={styles.completedCardSub}>들어볼까요? →</Text>
          </Pressable>
          <Pressable
            style={styles.completedCardDismiss}
            onPress={handleDismissCompletedCard}
            accessibilityLabel="닫기"
          >
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* 트랙 목록 */}
      {isLoading ? (
        // 스켈레톤 (3개)
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.skeletonItem} />
          ))}
        </View>
      ) : isEmpty ? (
        // 빈 상태
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🌙</Text>
          <Text style={styles.emptyTitle}>아직 자장가가 없어요</Text>
          <Text style={styles.emptySub}>목소리를 담아볼까요?</Text>
          <Pressable
            style={styles.emptyCtaBtn}
            onPress={() => navigation.navigate('SongSelect' as any)}
            accessibilityLabel="자장가 만들기"
          >
            <Text style={styles.emptyCtaBtnText}>자장가 만들기</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>내 자장가 ({completedTracks.length})</Text>
          <FlatList
            data={displayTracks}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TrackCard
                track={item}
                onPlay={handlePlayTrack}
                onRetryPending={handleRetryPending}
                onDelete={handleDeleteTrack}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      {/* FAB — 새 자장가 */}
      {!isEmpty && (
        <Pressable
          style={styles.fab}
          onPress={() => navigation.navigate('SongSelect' as any)}
          accessibilityLabel="새 자장가 만들기"
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0D0F1A' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16 },
  appName:        { color: '#EEF0F8', fontSize: 24, fontFamily: 'NotoSansKR-Regular' },
  settingsIcon:   { color: '#7B80A0', fontSize: 22, padding: 4 },

  counterBadge:   { marginHorizontal: 20, marginBottom: 8, backgroundColor: '#1A1D30', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start' },
  counterText:    { color: '#7B80A0', fontSize: 13 },

  completedCard:       { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#21253E', borderRadius: 16, overflow: 'hidden' },
  completedCardInner:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  completedCardTitle:  { color: '#F5C97A', fontSize: 16, fontFamily: 'NotoSansKR-Regular' },
  completedCardSub:    { color: '#8BAED4', fontSize: 14 },
  completedCardDismiss: { position: 'absolute', top: 12, right: 12, padding: 4 },
  dismissText:         { color: '#7B80A0', fontSize: 16 },

  sectionTitle:   { color: '#7B80A0', fontSize: 14, marginHorizontal: 20, marginBottom: 12 },
  listContent:    { paddingHorizontal: 20, paddingBottom: 100 },

  skeletonWrap:   { paddingHorizontal: 20, paddingTop: 8 },
  skeletonItem:   { height: 76, backgroundColor: '#1A1D30', borderRadius: 16, marginBottom: 10 },

  emptyWrap:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyEmoji:     { fontSize: 56, marginBottom: 20 },
  emptyTitle:     { color: '#EEF0F8', fontSize: 20, fontFamily: 'NotoSansKR-Regular', marginBottom: 8, textAlign: 'center' },
  emptySub:       { color: '#7B80A0', fontSize: 15, textAlign: 'center', marginBottom: 32 },
  emptyCtaBtn:    { height: 56, backgroundColor: '#F5C97A', borderRadius: 28, paddingHorizontal: 40, justifyContent: 'center', alignItems: 'center' },
  emptyCtaBtnText: { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },

  fab:            { position: 'absolute', bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#F5C97A', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabIcon:        { color: '#0D0F1A', fontSize: 28, lineHeight: 32 },
})
```

---

## 5. homeSlice 수정 (lastHomeVisitAt)

```typescript
// apps/mobile/src/store/homeSlice.ts (수정 또는 신규)
// lastHomeVisitAt은 AsyncStorage에 직접 저장 (Zustand persist 불필요)
// TrackCard 선택 상태, 삭제 확인 등 UI 상태 관리 시 추가

// V1에서 homeSlice는 별도 구현 불필요.
// HomeScreen 내부 로컬 state로 충분.
// tracks 목록을 전역에서 캐싱하려면 V2에서 homeSlice 추가.
```

---

## 6. 재진입 동선 — 생성 중 카드 → S12 복귀

```
[홈 화면 진입 — has_pending=true]
        │
        ├─ TrackCard (status='pending') 표시 — "만들고 있어요…" + 스피너
        │
        ├─ 카드 탭
        │         └─ handleRetryPending(track)
        │                    └─ navigation.navigate('Generating', { jobId: track.job_id, ... })
        │
        └─ S12 GeneratingScreen 진입
                   └─ POST /generations/init (동일 job_id)
                              └─ is_new=false → 현재 status 반환 → 폴링 재개
```

---

## 7. 결정 근거

### 트랙 표시 순서: pending → completed → failed

pending 트랙을 최상단에 배치하는 이유: 사용자가 "생성 중인 내 자장가"를 즉시 인식해야 함. 완료된 트랙이 하단에 있어도 완료 카드 배너가 상단에 표시되므로 UX 흐름 유지.

### failed 트랙 목록 포함 (숨김 X)

Story 3 수용 기준: 실패 후 홈 이동 → 완료 카드 표시. failed 트랙도 목록에서 삭제 가능하도록 노출. "생성 실패" 라벨로 상태 표시. 삭제 (롱탭)로 정리 가능.

### lastHomeVisitAt AsyncStorage 직접 저장 (Zustand 미사용)

Zustand persist는 앱 재시작 후 hydration 완료까지 null. AsyncStorage는 비동기지만 명시적 await로 타이밍 제어 가능. 타임스탬프 하나를 위해 slice 추가는 불필요.

---

## 8. 수용 기준

- [ ] 홈 진입 → GET /tracks 호출 확인 (last_checked_at 파라미터 포함)
- [ ] 트랙 없음 → 빈 상태 "아직 자장가가 없어요" + "자장가 만들기" CTA
- [ ] completed 트랙 → 카드 목록 + ▶ 버튼, 탭 → S13 이동
- [ ] pending 트랙 → 스피너 카드 "만들고 있어요…", 탭 → S12 복귀 (동일 job_id)
- [ ] completed_since_last_check=true → "새 자장가 완성!" 배너 노출 + pulse 2회
- [ ] 완료 카드 탭 → S13 이동 + 배너 닫힘
- [ ] 트랙 롱탭 → 삭제 확인 Alert → 삭제 → 목록에서 제거
- [ ] pending 트랙 삭제 시도 → "생성 중인 트랙은 삭제할 수 없어요" 토스트
- [ ] 무료 유저 홈 상단 "생성 N/3" 배지 노출
- [ ] 프리미엄 유저 → 생성 횟수 배지 미노출
- [ ] FAB "+ 새 자장가" 탭 → S07 이동

---

## 9. 주의사항

- Epic 01 impl/08 (`HomeScreen.tsx`) 기존 구현을 확장한다. 기존 구독 상태 표시 (트라이얼 배지, D-1 배너) 로직은 유지하고 트랙 목록 관련 코드만 추가한다. 파일 전체 교체 금지 — engineer가 기존 로직 파악 후 병합 필요.
- `handleRetryPending`에서 `sampleId: ''`을 전달하는 이유: 이미 서버에서 job이 진행 중이므로 클라이언트가 sampleId를 재전달할 필요가 없다. S12에서 `initGeneration`을 호출하면 서버가 기존 job_id로 멱등 반환 (is_new=false).
- `FlatList`의 `keyExtractor`는 `track.id` (UUID). `track.job_id`를 사용하지 않는 이유: job_id는 클라이언트 생성 UUID이며 failed 트랙 삭제 후 동일 job_id 재사용 시 key 충돌 가능성.
- `completedTracks.length`를 섹션 헤더에 표시: 생성 중/실패 트랙은 숫자에서 제외. "내 자장가 (2)" = 완성된 음원만 카운트.
- pending 트랙 삭제 시 서버에서 409 반환 → `Alert.alert('삭제에 실패했어요', ...)` 표시. 409의 detail 메시지를 파싱해 더 구체적인 안내 가능 (V2).
