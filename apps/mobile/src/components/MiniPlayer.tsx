/**
 * C06 — 미니 플레이어
 *
 * 커버 스토리: C06 미니 플레이어 컴포넌트
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/04-app-mini-player.md
 *
 * 모듈 경계:
 * - MiniPlayer → AudioEngine: pausePlayback, resumePlayback 호출
 * - MiniPlayer → PlayerSlice: isPlaying, currentTrackId, currentTrackUrl, currentSongKey (read)
 * - MiniPlayer → navigation: navigate('Play', params). params는 PlayerSlice에서 읽음
 * - S06에서 조건부 렌더. props 전달 없음
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { usePlayerStore } from '@store/player-store';
import { pausePlayback, resumePlayback } from '@audio/AudioEngine';
import { SONG_NAMES } from '@services/songs';
import type { MainStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

// ─── MiniWaveform (내부 컴포넌트) ──────────────────────────────────────────────

function MiniWaveform({ isPlaying }: { isPlaying: boolean }) {
  const bar0 = useRef(new Animated.Value(0.3)).current;
  const bar1 = useRef(new Animated.Value(0.6)).current;
  const bar2 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const bars = [bar0, bar1, bar2];

    if (!isPlaying) {
      bars.forEach(b => b.setValue(0.3));
      return;
    }

    const anims = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1.0, duration: 400 + i * 100, useNativeDriver: false }),
          Animated.timing(b, { toValue: 0.2, duration: 400 + i * 100, useNativeDriver: false }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [isPlaying, bar0, bar1, bar2]);

  return (
    <View style={waveformStyles.container}>
      {[bar0, bar1, bar2].map((b, i) => (
        <Animated.View
          key={i}
          style={[
            waveformStyles.bar,
            { height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) },
          ]}
        />
      ))}
    </View>
  );
}

// ─── MiniPlayer ───────────────────────────────────────────────────────────────

export default function MiniPlayer() {
  const { isPlaying, currentSongKey } = usePlayerStore();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  // SlideInDown 대응 — react-native-reanimated 미설치로 RN Animated 사용
  const slideAnim = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const handleBarPress = () => {
    const { currentTrackId, currentTrackUrl, currentSongKey: key } = usePlayerStore.getState();
    if (!currentTrackId || !currentTrackUrl || !key) return;
    navigation.navigate('Play', {
      trackId: currentTrackId,
      trackUrl: currentTrackUrl,
      songKey: key,
    });
  };

  const handlePlayPause = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingBottom: insets.bottom, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity
        style={styles.bar}
        onPress={handleBarPress}
        activeOpacity={0.8}
        accessibilityLabel="재생 중인 자장가로 이동"
      >
        <MiniWaveform isPlaying={isPlaying} />

        <Text style={styles.songName} numberOfLines={1}>
          {SONG_NAMES[currentSongKey ?? ''] ?? '자장가'}
        </Text>

        <Text style={styles.status}>{isPlaying ? '재생 중' : '일시정지'}</Text>

        <TouchableOpacity
          onPress={handlePlayPause}
          style={styles.playButton}
          accessibilityLabel={isPlaying ? '일시정지' : '재생'}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── 스타일 ───────────────────────────────────────────────────────────────────

const waveformStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#82B090',
    marginRight: 3,
  },
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1D30',
    borderTopWidth: 1,
    borderTopColor: '#252940',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 64,
  },
  songName: {
    flex: 1,
    color: '#EEF0F8',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  status: {
    color: '#7B80A0',
    fontSize: 12,
    marginRight: 12,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#252940',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    color: '#EEF0F8',
    fontSize: 14,
  },
});
