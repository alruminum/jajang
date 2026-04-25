---
depth: std
design: skipped
---

# impl/04 — 앱: 자장가 선택 화면 (S07)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 1 (자장가 선택)  
**선행 조건**: Epic 01 impl/03 (네비게이션 스캐폴드), impl/01 서버 songs API  
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── SongSelectScreen.tsx     [신규 — S07 자장가 선택 화면]
├── services/
│   └── api/songs.ts             [신규 — GET /songs, GET /songs/{key}/preview 클라이언트]
├── store/
│   └── recordingSlice.ts        [신규 — 선택 곡, 녹음 진행 상태 Zustand slice]
└── components/
    └── SongListItem.tsx         [신규 — 곡 리스트 아이템 컴포넌트]
```

---

## 2. Zustand 슬라이스 — recordingSlice

```typescript
// apps/mobile/src/store/recordingSlice.ts

export interface RecordingSlice {
  // 선택 상태 (S07)
  selectedSongKey: string | null

  // 녹음 흐름 상태
  recordingMode: 'humming' | 'shush' | null
  localAudioUri: string | null          // 녹음 완료 후 로컬 파일 URI
  uploadedSampleId: string | null       // 서버 sample_id (업로드 완료 후)
  qualityValidationPassed: boolean | null

  // 액션
  setSelectedSong: (key: string) => void
  setRecordingMode: (mode: 'humming' | 'shush') => void
  setLocalAudioUri: (uri: string | null) => void
  setUploadedSampleId: (id: string | null) => void
  setQualityValidationPassed: (passed: boolean) => void
  resetRecordingFlow: () => void        // 새 녹음 시작 시 상태 초기화
}
```

**슬라이스 분리 이유**: 녹음 흐름(S07→S08→S09→S10→S11)은 AuthSlice/PlayerSlice와 라이프사이클이 다르다. 생성 완료(Epic 03) 후 `resetRecordingFlow()` 호출로 정리.

---

## 3. API 클라이언트

```typescript
// apps/mobile/src/services/api/songs.ts

import { apiClient } from './client'  // Epic 01에서 생성한 axios 인스턴스 (JWT 인터셉터 포함)

export interface Song {
  key: string
  title_ko: string
  title_en: string
  composer: string
  duration_seconds: number
}

export interface SongListResponse {
  songs: Song[]
}

export interface PreviewUrlResponse {
  song_key: string
  preview_url: string
  expires_in_seconds: number
}

export const songsApi = {
  listSongs: (): Promise<SongListResponse> =>
    apiClient.get('/songs').then(r => r.data),

  getPreviewUrl: (songKey: string): Promise<PreviewUrlResponse> =>
    apiClient.get(`/songs/${songKey}/preview`).then(r => r.data),
}
```

---

## 4. SongListItem 컴포넌트

```typescript
// apps/mobile/src/components/SongListItem.tsx

import React from 'react'
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import type { Song } from '../services/api/songs'

interface SongListItemProps {
  song: Song
  isSelected: boolean
  isPreviewPlaying: boolean
  isPreviewLoading: boolean
  onSelect: () => void
  onPreviewToggle: () => void
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
          e.stopPropagation()  // 곡 선택 이벤트와 분리
          onPreviewToggle()
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
  )
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
})
```

---

## 5. SongSelectScreen 핵심 로직

```typescript
// apps/mobile/src/screens/SongSelectScreen.tsx

import React, { useEffect, useState, useRef } from 'react'
import { View, FlatList, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { Audio } from 'expo-av'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import { songsApi, Song } from '../services/api/songs'
import { useRecordingStore } from '../store/recordingSlice'
import { useAuthStore } from '../store/authSlice'
import { SongListItem } from '../components/SongListItem'

type Props = NativeStackScreenProps<RootStackParamList, 'SongSelect'>

export function SongSelectScreen({ navigation }: Props) {
  const [songs, setSongs] = useState<Song[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 미리듣기 상태
  const [previewingKey, setPreviewingKey] = useState<string | null>(null)
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)

  const { selectedSongKey, setSelectedSong, resetRecordingFlow } = useRecordingStore()
  const { entitlement, generationCount } = useAuthStore()

  const isFreeUser = entitlement === 'free'
  const generationsLeft = Math.max(0, 3 - generationCount)  // 0~3

  // 기존 음원 존재 여부 (S07 재녹음 안내 다이얼로그)
  // 실제 구현: generated_tracks에서 completed 음원 1개 이상 있는지 확인
  // V1 단순화: Zustand 또는 홈 화면에서 전달받은 prop 사용
  const hasExistingTrack = false  // TODO: Epic 03 완료 후 연동

  useEffect(() => {
    songsApi.listSongs()
      .then(r => setSongs(r.songs))
      .catch(() => Alert.alert('', '목록을 불러오지 못했어요. 다시 시도해주세요'))
      .finally(() => setIsLoading(false))

    return () => {
      // 화면 언마운트 시 미리듣기 정리
      soundRef.current?.unloadAsync()
    }
  }, [])

  // 미리듣기 토글 (동시 2곡 재생 불가)
  const handlePreviewToggle = async (songKey: string) => {
    // 현재 재생 중인 곡 정지
    if (soundRef.current) {
      await soundRef.current.unloadAsync()
      soundRef.current = null
    }

    if (previewingKey === songKey) {
      // 같은 곡 다시 탭 → 정지
      setPreviewingKey(null)
      return
    }

    setPreviewLoadingKey(songKey)
    try {
      const { preview_url } = await songsApi.getPreviewUrl(songKey)
      const { sound } = await Audio.Sound.createAsync(
        { uri: preview_url },
        { shouldPlay: true },
      )
      soundRef.current = sound
      setPreviewingKey(songKey)

      // 재생 완료 시 상태 리셋
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setPreviewingKey(null)
          sound.unloadAsync()
          soundRef.current = null
        }
      })
    } catch {
      Alert.alert('', '미리듣기를 불러오지 못했어요')
    } finally {
      setPreviewLoadingKey(null)
    }
  }

  // CTA 탭 핸들러
  const handleStartWithSong = () => {
    if (!selectedSongKey) return

    // 횟수 소진 체크 (무료 유저)
    if (isFreeUser && generationsLeft <= 0) {
      navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' })
      return
    }

    // 기존 다른 곡 음원 있을 때 재녹음 안내
    if (hasExistingTrack) {
      Alert.alert(
        '새 곡이니까 다시 녹음해야 해요',
        '기존 녹음을 지우고 새로 시작할까요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '확인',
            onPress: () => {
              resetRecordingFlow()
              navigation.navigate('RecordMode')
            },
          },
        ],
      )
      return
    }

    navigation.navigate('RecordMode')
  }

  return (
    <View style={styles.container}>
      {/* 헤더 영역 */}
      <View style={styles.header}>
        <Text style={styles.title}>어떤 멜로디로{'\n'}만들까요?</Text>
        {isFreeUser && (
          <View style={styles.counterChip}>
            <Text style={styles.counterText}>생성 {generationCount}/3</Text>
          </View>
        )}
      </View>

      {/* 곡 목록 */}
      <FlatList
        data={songs}
        keyExtractor={item => item.key}
        renderItem={({ item }) => (
          <SongListItem
            song={item}
            isSelected={selectedSongKey === item.key}
            isPreviewPlaying={previewingKey === item.key}
            isPreviewLoading={previewLoadingKey === item.key}
            onSelect={() => setSelectedSong(item.key)}
            onPreviewToggle={() => handlePreviewToggle(item.key)}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* CTA */}
      <Pressable
        style={[styles.cta, !selectedSongKey && styles.ctaDisabled]}
        onPress={handleStartWithSong}
        disabled={!selectedSongKey}
        accessibilityLabel="이 곡으로 시작"
        accessibilityState={{ disabled: !selectedSongKey }}
      >
        <Text style={styles.ctaText}>이 곡으로 시작</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  title:       { color: '#EEF0F8', fontSize: 22, fontFamily: 'NotoSansKR-Regular', lineHeight: 32 },
  counterChip: { backgroundColor: '#21253E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  counterText: { color: '#7B80A0', fontSize: 13 },
  list:        { paddingBottom: 100 },
  cta:         { position: 'absolute', bottom: 32, left: 20, right: 20, height: 56, backgroundColor: '#F5C97A', borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText:     { color: '#0D0F1A', fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
})
```

---

## 6. 네비게이션 연동

```typescript
// RootStackParamList 타입에 추가 (apps/mobile/src/navigation/types.ts)

SongSelect: undefined
RecordMode: undefined
UpgradeSheet: { variant: 'background' | 'generation_exhausted' }
```

---

## 7. 수용 기준

- [ ] S07 진입 시 6곡 목록 표시 (key: brahms, mozart, schubert, twinkle, rockabye, hush)
- [ ] 미리듣기 탭 → 30초 재생 후 자동 정지 + 상태 리셋
- [ ] 두 곡 미리듣기 동시 시도 → 이전 곡 정지 + 새 곡 재생
- [ ] 곡 탭 → 앰버 테두리 표시 + CTA 활성화 (opacity 0.4 → 1.0)
- [ ] 미선택 상태에서 CTA 탭 불가 (disabled)
- [ ] 무료 유저 3/3 소진 상태에서 CTA → UpgradeSheet variant=generation_exhausted 이동
- [ ] 무료 유저 S07 우상단 "생성 N/3" 칩 표시 (isFreeUser=true)
- [ ] 곡 선택 후 CTA → S08 RecordMode 화면 이동
- [ ] 화면 언마운트 시 미리듣기 Audio.Sound unload (메모리 누수 없음)

---

## 8. 주의사항

- `expo-av Audio.Sound`를 미리듣기 전용으로만 사용한다. 자장가 재생(S13)은 RNTP AudioEngine이 담당 — 두 레이어를 혼용하면 세션 충돌 가능.
- `hasExistingTrack` 플래그는 Epic 03 완료 후 연동. V1 첫 빌드에서 `false` 하드코딩 허용 — 재녹음 안내 다이얼로그 미표시.
- 생성 횟수(generationCount)는 Zustand `SubscriptionSlice` 또는 `AuthSlice`에서 읽는다. 서버 `/auth/me` 응답에 포함되거나 Epic 03에서 별도 조회. 이 화면은 읽기만 한다.
- 미리듣기 presigned URL은 요청 시마다 서버 호출로 발급받는다. 캐싱 없음 (1시간 내 재탭 시 새 URL). 트래픽 고려 시 V2에서 로컬 캐시 도입 가능.
