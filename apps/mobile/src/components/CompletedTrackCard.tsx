import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '@navigation/types';
import { GeneratedTrack } from '@services/tracks-api';
import { SONG_NAMES } from '@services/songs';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

interface Props {
  track: GeneratedTrack;
  onDismiss: () => void;
}

/**
 * 백그라운드 생성 완료 후 홈 재진입 시 자동 노출 (PRD F4)
 */
export default function CompletedTrackCard({ track, onDismiss }: Props) {
  const navigation = useNavigation<NavProp>();

  const songName = SONG_NAMES[track.song_key] ?? track.song_key;

  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>새 자장가 완성</Text>
      </View>
      <Text style={styles.songName}>{songName}</Text>
      <Text style={styles.subtext}>내 목소리로 만든 자장가가 준비됐어요</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            onDismiss();
            navigation.navigate('Play', { trackId: track.id });
          }}
          accessibilityRole="button"
          accessibilityLabel="들어볼게요"
        >
          <Text style={styles.primaryBtnText}>들어볼게요</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          style={styles.dismissBtn}
          accessibilityRole="button"
          accessibilityLabel="나중에 들을게요"
        >
          <Text style={styles.dismissText}>나중에 들을게요</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1D30',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  badge: {
    backgroundColor: 'rgba(139, 174, 212, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  badgeText: { color: '#8BAED4', fontSize: 12, fontWeight: '500' },
  songName: { color: '#EEF0F8', fontSize: 18, fontWeight: '600', marginBottom: 6 },
  subtext: { color: '#7B80A0', fontSize: 13, marginBottom: 20 },
  actions: { gap: 10 },
  primaryBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#82B090',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#0D0F1A', fontSize: 15, fontWeight: '600' },
  dismissBtn: { alignItems: 'center', padding: 10 },
  dismissText: { color: '#7B80A0', fontSize: 14 },
});
