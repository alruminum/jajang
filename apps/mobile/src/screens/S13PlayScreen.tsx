/**
 * S13 — 재생 화면 (PlayScreen)
 *
 * 커버 스토리: Story 1 (재생 화면 기본 컨트롤), Story 3 (백그라운드 재생 — UI 분기),
 *              Story 5 (Lockscreen 연동)
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/02-app-play-screen.md
 *
 * 모듈 경계:
 * - S13 → AudioEngine: startPlayback, pausePlayback, resumePlayback, setVolume, isVolumeControlLocked
 * - S13 → PlayerSlice: isPlaying, volume, timerEndsAt, pendingUpgradePrompt (read-only)
 * - handleBack(): useBackNavigation 훅 (impl/05)
 * - openTimerSheet(): impl/03에서 구현 예정 — 현재 로컬 stub
 * - BannerAdSlot: impl/07에서 구현 예정 — null placeholder
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MainStackParamList } from '@navigation/types';
import { usePlayerStore } from '@store/player-store';
import { useAuthStore } from '@store/auth-store';
import { SONG_NAMES } from '@services/songs';
import {
  startPlayback,
  pausePlayback,
  resumePlayback,
  setVolume,
  isVolumeControlLocked,
} from '@audio/AudioEngine';
import AlbumArtRotating from '@components/AlbumArtRotating';
import VolumeSlider from '@components/VolumeSlider';
import TimerBottomSheet from '@components/TimerBottomSheet';
import { useBackNavigation } from '@hooks/useBackNavigation';
import BannerAdSlot from '@components/BannerAdSlot';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type PlayScreenProps = NativeStackScreenProps<MainStackParamList, 'Play'>;

// ─── 알림 권한 요청 (첫 진입 1회) ─────────────────────────────────────────────

async function requestNotificationPermissionOnFirstEntry(): Promise<void> {
  const alreadyAsked = await AsyncStorage.getItem('notif_permission_asked');
  if (alreadyAsked) return;

  let permission: 'granted' | 'denied' = 'denied';
  try {
    // expo-notifications 동적 로드 (미설치 시 graceful fallback)
    // 설치: npx expo install expo-notifications
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requestPermissionsAsync } = require('expo-notifications') as {
      requestPermissionsAsync: () => Promise<{ status: string }>;
    };
    const { status } = await requestPermissionsAsync();
    permission = status === 'granted' ? 'granted' : 'denied';
  } catch {
    // expo-notifications 미설치 또는 권한 요청 실패 — silently skip
  }

  usePlayerStore.setState({ notificationPermission: permission });
  await AsyncStorage.setItem('notif_permission_asked', '1');
}

// ─── TimerRemainingLabel (내부 컴포넌트) ──────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    if (minutes > 0) return `${hours}시간 ${minutes}분 남음`;
    return `${hours}시간 남음`;
  }
  if (minutes > 0) return `${minutes}분 남음`;
  return `${seconds}초 남음`;
}

function TimerRemainingLabel({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const r = endsAt - Date.now();
      setRemaining(r > 0 ? r : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return (
    <Text style={styles.timerLabel}>
      {formatDuration(remaining)}
    </Text>
  );
}

// ─── PlayPauseButton (내부 컴포넌트) ──────────────────────────────────────────

function PlayPauseButton({
  isPlaying,
  onPress,
}: {
  isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.playPauseBtn}
      onPress={onPress}
      accessibilityLabel={isPlaying ? '일시정지' : '재생'}
      accessibilityRole="button"
    >
      <Text style={styles.playPauseBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
    </Pressable>
  );
}

// ─── TimerButton (내부 컴포넌트) ──────────────────────────────────────────────

function TimerButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={styles.timerBtn}
      onPress={onPress}
      accessibilityLabel="수면 타이머 설정"
      accessibilityRole="button"
    >
      <Text style={styles.timerBtnText}>⏱</Text>
    </Pressable>
  );
}

// ─── Header (내부 컴포넌트) ────────────────────────────────────────────────────

function Header({
  onBack,
  rightAction,
}: {
  onBack: () => void;
  rightAction?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        style={styles.headerBackBtn}
        onPress={onBack}
        accessibilityLabel="뒤로가기"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.headerBackText}>{'<'}</Text>
      </Pressable>
      <View style={styles.headerRight}>{rightAction}</View>
    </View>
  );
}

// ─── PlayScreen ───────────────────────────────────────────────────────────────

export default function S13PlayScreen({ route }: PlayScreenProps) {
  const { trackId, trackUrl, presignUrl, songKey } = route.params;

  // trackUrl 우선, S12의 presignUrl 하위호환 처리
  const resolvedTrackUrl = trackUrl ?? presignUrl ?? '';
  const resolvedSongKey = songKey ?? '';

  const { isPlaying, volume, timerEndsAt, pendingUpgradePrompt } = usePlayerStore();
  const { entitlement } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList, 'Play'>>();

  // 뒤로가기 분기 훅 (impl/05)
  const { handleBack, confirmDialog } = useBackNavigation({ entitlement, isPlaying });

  // 볼륨 슬라이더 잠금 여부 (crossfade 중)
  const volumeLocked = isVolumeControlLocked();

  // 타이머 바텀시트 표시 상태
  const [timerSheetVisible, setTimerSheetVisible] = useState(false);

  // 재생 시작 여부 ref (StrictMode 이중 실행 방지)
  const startedRef = useRef(false);

  // ── 마운트: 재생 시작 + 알림 권한 요청 ───────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    startPlayback({ trackId, trackUrl: resolvedTrackUrl, songKey: resolvedSongKey }).catch(
      (err) => console.error('[S13] startPlayback failed:', err),
    );
    requestNotificationPermissionOnFirstEntry().catch(
      (err) => console.error('[S13] requestNotificationPermission failed:', err),
    );

    return () => {
      // unmount 시 재생 중단하지 않음 — 뒤로가기 정책은 impl/05 처리
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pendingUpgradePrompt 감시 → UpgradeSheet 자동 노출 (AC-11) ───────────────
  useEffect(() => {
    if (pendingUpgradePrompt === 'background_blocked') {
      navigation.navigate('UpgradeSheet', { variant: 'background' });
    }
  }, [pendingUpgradePrompt, navigation]);

  // ── iOS 스와이프백 비활성화 (AC-09) ──────────────────────────────────────────
  // gestureEnabled=false 로 스와이프백 제스처를 막아 entitlement 분기 없는 화면 이탈 방지
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  // ── 핸들러 ───────────────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (isPlaying) {
      pausePlayback().catch((err) => console.error('[S13] pausePlayback failed:', err));
    } else {
      resumePlayback().catch((err) => console.error('[S13] resumePlayback failed:', err));
    }
  };

  const handleVolumeChange = (v: number) => {
    if (isVolumeControlLocked()) return; // crossfade 중 (AC-05)
    setVolume(v).catch((err) => console.error('[S13] setVolume failed:', err));
  };

  // ── 렌더링 ────────────────────────────────────────────────────────────────────

  const songTitle = SONG_NAMES[resolvedSongKey] ?? resolvedSongKey;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        onBack={handleBack}
        rightAction={<TimerButton onPress={() => setTimerSheetVisible(true)} />}
      />

      <View style={styles.artContainer}>
        <AlbumArtRotating isPlaying={isPlaying} />
      </View>

      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {songTitle}
        </Text>
        <Text style={styles.songSubtitle}>내 목소리로 만든 자장가</Text>
      </View>

      <View style={styles.sliderContainer}>
        <VolumeSlider
          value={volume}
          disabled={volumeLocked}
          onChange={handleVolumeChange}
        />
      </View>

      <PlayPauseButton isPlaying={isPlaying} onPress={handlePlayPause} />

      {timerEndsAt !== null && (
        <TimerRemainingLabel endsAt={timerEndsAt} />
      )}

      {/* 무료 유저만 — impl/07 BannerAdSlot */}
      {entitlement === 'free' && <BannerAdSlot />}

      {/* 수면 타이머 바텀시트 (impl/03) */}
      <TimerBottomSheet
        visible={timerSheetVisible}
        currentEndsAt={timerEndsAt}
        onClose={() => setTimerSheetVisible(false)}
      />

      {/* 무료 유저 뒤로가기 확인 다이얼로그 (impl/05) */}
      {confirmDialog}
    </SafeAreaView>
  );
}

// ─── 스타일 (ux-flow.md 기반) ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  // 배경: #0D0F1A
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    alignItems: 'center',
  },

  // Header
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 56,
  },
  headerBackBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackText: {
    color: '#EEF0F8',
    fontSize: 22,
  },
  headerRight: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // AlbumArt
  artContainer: {
    marginTop: 32,
    marginBottom: 36,
  },

  // SongInfo
  songInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  // 텍스트 주: #EEF0F8
  songTitle: {
    color: '#EEF0F8',
    fontSize: 22,
    marginBottom: 6,
  },
  // 텍스트 보조: #7B80A0
  songSubtitle: {
    color: '#7B80A0',
    fontSize: 14,
  },

  // VolumeSlider
  sliderContainer: {
    width: '80%',
    marginBottom: 40,
  },

  // PlayPauseButton: 앰버 채움, 높이 56, borderRadius 28
  playPauseBtn: {
    height: 56,
    width: 120,
    backgroundColor: '#82B090',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  playPauseBtnText: {
    color: '#0D0F1A',
    fontSize: 24,
  },

  // TimerButton
  timerBtn: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerBtnText: {
    color: '#EEF0F8',
    fontSize: 22,
  },

  // TimerRemainingLabel: 앰버 색상 (tabular-nums)
  timerLabel: {
    color: '#82B090',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
