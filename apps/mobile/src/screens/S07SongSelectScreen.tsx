import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, FlatList, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';

import { songsApi, type Song } from '@services/api/songs';
import { useRecordingStore } from '@store/recordingSlice';
import { useAuthStore } from '@store/authSlice';
import { SongListItem } from '@components/SongListItem';
import { MainStackParamList } from '@navigation/types';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';
import { LocalCounterRepo } from '../audio/local-dsp/LocalCounterRepo';

type Props = NativeStackScreenProps<MainStackParamList, 'SongSelect'>;

const FREE_GENERATION_LIMIT = 3;

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container:   { flex: 1, backgroundColor: colors.bgPrimary, paddingHorizontal: 20 },
    header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
    title:       { color: colors.textPrimary, fontSize: 22, fontFamily: 'NotoSansKR-Regular', lineHeight: 32 },
    counterChip: { backgroundColor: colors.surfaceHigh, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
    counterText: { color: colors.textSecondary, fontSize: 13 },
    list:        { paddingBottom: 100 },
    cta:         { position: 'absolute', bottom: 32, left: 20, right: 20, height: 56, backgroundColor: colors.accentPrimary, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    ctaDisabled: { opacity: 0.4 },
    ctaText:     { color: colors.bgPrimary, fontSize: 17, fontFamily: 'NotoSansKR-Regular' },
  });

export function SongSelectScreen({ navigation }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 미리듣기 상태
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewLoadingKey, setPreviewLoadingKey] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const { selectedSongKey, setSelectedSong, resetRecordingFlow } = useRecordingStore();
  // entitlement — 서버 기반 entitlement 체크 (기존 유지)
  const authState = useAuthStore() as unknown as {
    entitlement: 'free' | 'trial' | 'premium';
    generationCount: number;
  };
  const { entitlement } = authState;

  // task 10: localCount — LocalCounterRepo.peek() 소스로 교체 (서버 generationCount 제거)
  const [localCount, setLocalCount] = useState(0);
  const [localLimit, setLocalLimit] = useState(FREE_GENERATION_LIMIT);
  // useRef: 테스트에서 mock constructor 가 render 시 호출되어 mock instance 반환
  const counterRepoRef = useRef<LocalCounterRepo | null>(null);
  if (!counterRepoRef.current) {
    counterRepoRef.current = new LocalCounterRepo();
  }

  const isFreeUser = entitlement === 'free';
  const generationsLeft = Math.max(0, localLimit - localCount);

  // 기존 음원 존재 여부 (S07 재녹음 안내 다이얼로그)
  // V1 첫 빌드: false 하드코딩 — Epic 03 완료 후 연동
  const hasExistingTrack = false;

  useEffect(() => {
    songsApi.listSongs()
      .then(r => setSongs(r.songs))
      .catch(() => Alert.alert('', '목록을 불러오지 못했어요. 다시 시도해주세요'))
      .finally(() => setIsLoading(false));
  }, []);

  // task 10: focus 진입 시 LocalCounterRepo.peek() → localCount 갱신
  useFocusEffect(
    useCallback(() => {
      counterRepoRef.current?.peek().then(({ count, limit }) => {
        setLocalCount(count);
        setLocalLimit(limit);
      });
    }, []),
  );

  // NativeStack push-navigate는 unmount를 일으키지 않으므로 useFocusEffect로 blur를 잡는다 (#129).
  useFocusEffect(
    useCallback(() => {
      return () => {
        playerRef.current?.pause();
        playerRef.current?.remove();
        playerRef.current = null;
        setPreviewingKey(null);
        setPreviewLoadingKey(null);
      };
    }, []),
  );

  // 미리듣기 토글 (동시 2곡 재생 불가)
  const handlePreviewToggle = async (songKey: string) => {
    // 현재 재생 중인 곡 정지
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current.remove();
      playerRef.current = null;
    }

    if (previewingKey === songKey) {
      // 같은 곡 다시 탭 → 정지
      setPreviewingKey(null);
      return;
    }

    setPreviewLoadingKey(songKey);
    try {
      const { preview_url } = await songsApi.getPreviewUrl(songKey);
      const player = createAudioPlayer({ uri: preview_url });
      playerRef.current = player;
      player.play();
      setPreviewingKey(songKey);

      // 재생 완료 시 상태 리셋
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.didJustFinish) {
          setPreviewingKey(null);
          player.remove();
          playerRef.current = null;
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

    // 횟수 소진 체크 — task 10: LocalCounterRepo 소스로 교체
    if (localCount >= localLimit) {
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
              navigation.navigate('RecordGuide', { songKey: selectedSongKey });
            },
          },
        ],
      );
      return;
    }

    // S07 → S09 직결 (S08 RecordMode 폐기 — impl/13)
    navigation.navigate('RecordGuide', { songKey: selectedSongKey });
  };

  return (
    <View style={styles.container}>
      {/* 헤더 영역 */}
      <View style={styles.header}>
        <Text style={styles.title}>어떤 멜로디로{'\n'}만들까요?</Text>
        {isFreeUser && (
          <View style={styles.counterChip}>
            <Text style={styles.counterText}>생성 {localCount}/{localLimit}</Text>
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

      {/* CTA — task 10: 카운터 소진 시도 disabled */}
      {/* isCounterExhausted: localCount >= localLimit 시 CTA opacity 0.4 + disabled */}
      <Pressable
        style={[styles.cta, (!selectedSongKey || localCount >= localLimit) && styles.ctaDisabled]}
        onPress={handleStartWithSong}
        disabled={!selectedSongKey || localCount >= localLimit}
        accessibilityLabel="이 곡으로 시작"
        accessibilityState={{ disabled: !selectedSongKey || localCount >= localLimit }}
      >
        <Text style={styles.ctaText}>이 곡으로 시작</Text>
      </Pressable>
    </View>
  );
}

// Default export for MainNavigator compatibility
export default SongSelectScreen;
