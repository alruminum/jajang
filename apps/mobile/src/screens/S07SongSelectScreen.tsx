import React, { useEffect, useState, useRef } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { songsApi, type Song } from '@services/api/songs';
import { useRecordingStore } from '@store/recordingSlice';
import { useAuthStore } from '@store/authSlice';
import { SongListItem } from '@components/SongListItem';
import { MainStackParamList } from '@navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'SongSelect'>;

export function SongSelectScreen({ navigation }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 미리듣기 상태
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const { selectedSongKey, setSelectedSong, resetRecordingFlow } = useRecordingStore();
  // generationCount는 Epic 03 완료 후 AuthStore에 추가 예정.
  // 현재는 unknown을 경유한 캐스트로 접근 (test mock 호환).
  const authState = useAuthStore() as unknown as {
    entitlement: 'free' | 'trial' | 'premium';
    generationCount: number;
  };
  const { entitlement, generationCount } = authState;

  const isFreeUser = entitlement === 'free';
  const generationsLeft = Math.max(0, 3 - generationCount); // 0~3

  // 기존 음원 존재 여부 (S07 재녹음 안내 다이얼로그)
  // V1 첫 빌드: false 하드코딩 — Epic 03 완료 후 연동
  const hasExistingTrack = false;

  useEffect(() => {
    songsApi.listSongs()
      .then(r => setSongs(r.songs))
      .catch(() => Alert.alert('', '목록을 불러오지 못했어요. 다시 시도해주세요'))
      .finally(() => setIsLoading(false));

    return () => {
      // 화면 언마운트 시 미리듣기 정리
      soundRef.current?.unloadAsync();
    };
  }, []);

  // 미리듣기 토글 (동시 2곡 재생 불가)
  const handlePreviewToggle = async (songKey: string) => {
    // 현재 재생 중인 곡 정지
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    if (previewingKey === songKey) {
      // 같은 곡 다시 탭 → 정지
      setPreviewingKey(null);
      return;
    }

    setPreviewLoadingKey(songKey);
    try {
      const { preview_url } = await songsApi.getPreviewUrl(songKey);
      const { sound } = await Audio.Sound.createAsync(
        { uri: preview_url },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setPreviewingKey(songKey);

      // 재생 완료 시 상태 리셋
      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          setPreviewingKey(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch {
      Alert.alert('', '미리듣기를 불러오지 못했어요');
    } finally {
      setPreviewLoadingKey(null);
    }
  };

  // CTA 탭 핸들러
  const handleStartWithSong = () => {
    if (!selectedSongKey) return;

    // 횟수 소진 체크 (무료 유저)
    if (isFreeUser && generationsLeft <= 0) {
      navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' });
      return;
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
              resetRecordingFlow();
              navigation.navigate('RecordMode');
            },
          },
        ],
      );
      return;
    }

    navigation.navigate('RecordMode');
  };

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
  );
}

// Default export for MainNavigator compatibility
export default SongSelectScreen;

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
});
