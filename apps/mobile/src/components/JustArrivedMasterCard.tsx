// apps/mobile/src/components/JustArrivedMasterCard.tsx
// S06 "방금 도착" 카드 — pending session 복원 후 completed 시 노출
// impl/07 §1

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface Props {
  songKey: string;
  onPlay: () => void;
  onDismiss: () => void;
}

export default function JustArrivedMasterCard({ songKey: _songKey, onPlay, onDismiss }: Props) {
  // songKey는 현재 getSessionStatus 응답에 없으므로 MVP에서는 generic 라벨 표시
  // (impl/07 §7 주의사항 — 정확한 song_key는 PlayScreen에서 메타 표시)
  return (
    <View style={styles.card}>
      <View style={styles.textArea}>
        <Text style={styles.label}>방금 도착했어요!</Text>
        <Text style={styles.sub}>자장가가 완성됐어요</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.playBtn}
          onPress={onPlay}
          accessibilityLabel="자장가 재생"
        >
          <Text style={styles.playBtnText}>재생</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="닫기"
          hitSlop={8}
        >
          <Text style={styles.dismissText}>닫기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1E2540',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#5A7AA8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textArea: { flex: 1 },
  label: { color: '#EEF0F8', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  sub: { color: '#7B80A0', fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: {
    backgroundColor: '#5A7AA8',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  playBtnText: { color: '#0D0F1A', fontSize: 14, fontWeight: '600' },
  dismissText: { color: '#7B80A0', fontSize: 13 },
});
