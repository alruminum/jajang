import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRecordingStore } from '@store/recordingSlice';
import { useAuthStore } from '@store/authSlice';
import type { MainStackParamList } from '@navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'RecordMode'>;

type Mode = 'humming' | 'shush';

interface ModeCardData {
  key: Mode;
  emoji: string;
  title: string;
  description: string;
  badge?: string;
}

const MODES: ModeCardData[] = [
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
];

export function RecordModeScreen({ navigation }: Props) {
  const { setRecordingMode } = useRecordingStore();
  // generationCount는 Epic 03 완료 후 AuthStore에 추가 예정.
  // 현재는 unknown을 경유한 캐스트로 접근 (test mock 호환).
  const authState = useAuthStore() as unknown as {
    entitlement: 'free' | 'trial' | 'premium';
    generationCount: number;
  };
  const { entitlement, generationCount } = authState;
  const isFreeUser = entitlement === 'free';

  const handleSelectMode = (mode: Mode) => {
    setRecordingMode(mode);
    navigation.navigate('RecordGuide', { mode });
  };

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
  );
}

// ─────────────────────────────────────────
// ModeCard 내부 컴포넌트 (파일 내 로컬)
// ─────────────────────────────────────────
interface ModeCardProps {
  card: ModeCardData;
  onPress: () => void;
}

function ModeCard({ card, onPress }: ModeCardProps) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <Pressable
      style={[styles.card, pressed && styles.cardPressed]}
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
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0D0F1A', paddingHorizontal: 20, paddingTop: 24 },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title:       { color: '#EEF0F8', fontSize: 22, fontFamily: 'NotoSansKR-Regular' },
  counterChip: { backgroundColor: '#21253E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  counterText: { color: '#7B80A0', fontSize: 13 },
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
  cardPressed: { transform: [{ scale: 1.02 }], borderColor: '#F5C97A' },
  cardEmoji:   { fontSize: 36, marginBottom: 12 },
  cardTitle:   { color: '#EEF0F8', fontSize: 18, fontFamily: 'NotoSansKR-Regular', marginBottom: 8 },
  cardDesc:    { color: '#7B80A0', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  badge:       { marginTop: 10, backgroundColor: '#21253E', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:   { color: '#F5C97A', fontSize: 12 },
});
