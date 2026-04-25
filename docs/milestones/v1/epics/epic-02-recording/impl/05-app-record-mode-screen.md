---
depth: std
design: skipped
---

# impl/05 — 앱: 녹음 모드 선택 화면 (S08)

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**커버 스토리**: Story 2 (녹음 모드 선택)  
**선행 조건**: impl/04 완료 (SongSelectScreen, RecordingSlice)  
**예상 소요**: 1~2시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   └── RecordModeScreen.tsx     [신규 — S08 녹음 모드 선택]
└── store/
    └── recordingSlice.ts        [수정 — recordingMode 타입 이미 선언됨, 확인만]
```

---

## 2. RecordModeScreen

```typescript
// apps/mobile/src/screens/RecordModeScreen.tsx

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useRecordingStore } from '../store/recordingSlice'

type Props = NativeStackScreenProps<RootStackParamList, 'RecordMode'>

type Mode = 'humming' | 'shush'

interface ModeCard {
  key: Mode
  emoji: string
  title: string
  description: string
  badge?: string
}

const MODES: ModeCard[] = [
  {
    key: 'humming',
    emoji: '🎵',
    title: '허밍 모드',
    description: '흥얼거리듯 멜로디를 따라 불러주세요',
    badge: '추천 · 더 자연스럽게',
  },
  {
    key: 'shush',
    emoji: '🤫',
    title: '쉿 모드',
    description: '쉬이이~ 하고 달래는 소리를 내주세요',
  },
]

export function RecordModeScreen({ navigation }: Props) {
  const { setRecordingMode, selectedSongKey } = useRecordingStore()
  const { entitlement, generationCount } = useAuthStore()
  const isFreeUser = entitlement === 'free'

  const handleSelectMode = (mode: Mode) => {
    setRecordingMode(mode)
    // 즉시 이동 (탭 즉시 scale + glow 후 navigate)
    navigation.navigate('RecordGuide', { mode })
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>어떻게 녹음할까요?</Text>
        {isFreeUser && (
          <View style={styles.counterChip}>
            <Text style={styles.counterText}>생성 {generationCount}/3</Text>
          </View>
        )}
      </View>

      {/* 모드 카드 */}
      {MODES.map(mode => (
        <ModeCard
          key={mode.key}
          card={mode}
          onPress={() => handleSelectMode(mode.key)}
        />
      ))}
    </View>
  )
}

// ─────────────────────────────────────────
// ModeCard 내부 컴포넌트 (파일 내 로컬)
// ─────────────────────────────────────────
interface ModeCardProps {
  card: ModeCard
  onPress: () => void
}

function ModeCard({ card, onPress }: ModeCardProps) {
  const [pressed, setPressed] = React.useState(false)

  return (
    <Pressable
      style={[
        styles.card,
        pressed && styles.cardPressed,
      ]}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityLabel={`${card.title} 선택`}
      accessibilityRole="button"
    >
      <Text style={styles.cardEmoji}>{card.emoji}</Text>
      <Text style={styles.cardTitle}>{card.title}</Text>
      <Text style={styles.cardDesc}>{card.description}</Text>
      {card.badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{card.badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20, paddingTop: 24 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title:        { color: '#EEF0F8', fontSize: 22, fontFamily: 'NotoSansKR-Regular' },
  counterChip:  { backgroundColor: '#21253E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  counterText:  { color: '#7B80A0', fontSize: 13 },
  card: {
    backgroundColor: '#1A1D30',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
  },
  cardPressed:  { transform: [{ scale: 1.02 }], borderColor: '#F5C97A' },  // glow border on press
  cardEmoji:    { fontSize: 36, marginBottom: 12 },
  cardTitle:    { color: '#EEF0F8', fontSize: 18, fontFamily: 'NotoSansKR-Regular', marginBottom: 8 },
  cardDesc:     { color: '#7B80A0', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  badge:        { marginTop: 10, backgroundColor: '#21253E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:    { color: '#F5C97A', fontSize: 12 },
})
```

---

## 3. 네비게이션 타입 추가

```typescript
// apps/mobile/src/navigation/types.ts 에 추가

RecordGuide: { mode: 'humming' | 'shush' }
```

---

## 4. 수용 기준

- [ ] S08 진입 시 허밍/쉿 두 카드 동등 표시
- [ ] 허밍 카드 탭 → scale 1.02 + 앰버 테두리 피드백 → S09(RecordGuide) 이동 (mode='humming')
- [ ] 쉿 카드 탭 → scale 1.02 + 앰버 테두리 피드백 → S09(RecordGuide) 이동 (mode='shush')
- [ ] recordingSlice.recordingMode 값 저장 확인 ('humming' 또는 'shush')
- [ ] 무료 유저 우상단 "생성 N/3" 칩 표시
- [ ] accessibilityLabel 각 카드에 존재

---

## 5. 주의사항

- 카드 탭 시 별도 CTA 버튼 없이 즉시 이동한다 (UX Flow S08 인터랙션 정의). "선택 후 다음" 이중 탭 패턴은 S07에서 사용하고, S08은 단일 탭 이동으로 흐름 가속.
- ModeCard는 파일 내 로컬 컴포넌트로 유지한다. 다른 화면에서 재사용 불필요.
- `useAuthStore` import는 Epic 01 구현 완료된 store를 사용한다. 경로 확인 필수.
