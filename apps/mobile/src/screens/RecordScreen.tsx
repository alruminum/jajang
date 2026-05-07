// apps/mobile/src/screens/RecordScreen.tsx
// S10 — 녹음 화면 (카운트다운 → 실시간 파형 → 1 loop 자동/수동 종료 → S11 이동)

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  BackHandler,
} from 'react-native';
import * as ExpoAudio from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { IOSOutputFormat, AudioQuality } from 'expo-audio';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { LyricsBox } from '../components/LyricsBox';
import { useBgmPlayer } from '../hooks/useBgmPlayer';
import { useRecordingStore } from '../store/recordingSlice';
import { BGM_TRACKS } from '../data/bgmTracks';
import { Typography } from '../theme/typography';
import type { MainStackParamList } from '../navigation/types';

const COUNTDOWN_START = 3;
const SILENCE_THRESHOLD = 0.02;
const SILENCE_WARN_SEC = 10;
const BGM_FAIL_TOAST_MS = 3000;
// BGM_TRACKS 에 songKey 매핑 없을 때 사용할 fallback (실제 곡은 매번 매핑되어 사용됨)
const FALLBACK_LOOP_DURATION_MS = 120000;

type ScreenPhase = 'countdown' | 'recording';

const RECORDING_OPTIONS: RecordingOptions = {
  isMeteringEnabled: true,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};

function meteringToLevel(metering: number | undefined): number {
  if (metering === undefined || metering === 0) return 0;
  const clamped = Math.max(-60, metering);
  return (clamped + 60) / 60;
}

const useAudioRecorderStateSafe =
  ExpoAudio.useAudioRecorderState ??
  ((): { isRecording: boolean; metering: number | undefined } => ({
    isRecording: false,
    metering: undefined,
  }));

export function RecordScreen() {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Record'>>();
  const { setLocalAudioUri } = useRecordingStore();
  const { songKey } = route.params;
  const bgmTitle = BGM_TRACKS[songKey as keyof typeof BGM_TRACKS]?.titleKo;
  const loopDurationMs =
    BGM_TRACKS[songKey as keyof typeof BGM_TRACKS]?.loopDurationMs ??
    FALLBACK_LOOP_DURATION_MS;

  const [phase, setPhase] = useState<ScreenPhase>('countdown');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [showSilenceWarning, setShowSilenceWarning] = useState(false);
  const [showBgmFailToast, setShowBgmFailToast] = useState(false);

  const recorder = ExpoAudio.useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderStateSafe(recorder, 100);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);
  const silentSecRef = useRef(0);
  const levelsRef = useRef<number[]>([]);
  const recordingStartedRef = useRef(false);
  const failToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // forward-ref: handleAutoStop 가 useBgmPlayer 보다 먼저 선언돼야 하므로
  // stopAndNavigate 의 최신 참조를 ref 로 노출한다.
  const stopAndNavigateRef = useRef<(() => Promise<void>) | null>(null);

  const handleAutoStop = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    await stopAndNavigateRef.current?.();
  }, []);

  const { isPlaying: isBgmPlaying, loadFailed: bgmLoadFailed, startBgm, stopBgm } =
    useBgmPlayer({
      songKey,
      enabled: true,
      onLoadError: () => setShowBgmFailToast(true),
      onPlaybackEnd: handleAutoStop,
    });

  const cleanupRecording = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!recordingStartedRef.current) return null;
    try {
      await recorder.stop();
      recordingStartedRef.current = false;
      return recorder.uri ?? null;
    } catch {
      recordingStartedRef.current = false;
      return null;
    }
  }, [recorder]);

  const stopAndNavigate = useCallback(async () => {
    await stopBgm();
    const uri = await cleanupRecording();
    if (uri) {
      setLocalAudioUri(uri);
      navigation.navigate('Preview', { recordingUri: uri, songKey });
    }
  }, [stopBgm, cleanupRecording, setLocalAudioUri, navigation, songKey]);

  useEffect(() => {
    stopAndNavigateRef.current = stopAndNavigate;
  }, [stopAndNavigate]);

  const handleStopPress = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    await stopAndNavigate();
  }, [stopAndNavigate]);

  const handleCancel = useCallback(async () => {
    await stopBgm();
    Alert.alert('녹음을 취소할까요?', '', [
      { text: '계속 녹음', style: 'cancel' },
      {
        text: '취소',
        style: 'destructive',
        onPress: async () => {
          await cleanupRecording();
          // RecordMode(S08) 폐기 (impl/13) — SongSelect로 fallback
          navigation.navigate('SongSelect');
        },
      },
    ]);
  }, [stopBgm, cleanupRecording, navigation]);

  const restartRecording = useCallback(async () => {
    await stopBgm();
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    isStoppingRef.current = false;
    await cleanupRecording();
    setElapsedSec(0);
    setLevels([]);
    setCountdown(COUNTDOWN_START);
    silentSecRef.current = 0;
    levelsRef.current = [];
    setShowSilenceWarning(false);
    setPhase('countdown');
  }, [stopBgm, cleanupRecording]);

  const startRecording = useCallback(async () => {
    try {
      await ExpoAudio.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await (recorder as { prepareToRecordAsync?: () => Promise<void> })
        .prepareToRecordAsync?.();
      recorder.record();
      recordingStartedRef.current = true;
      setPhase('recording');

      try {
        await startBgm();
      } catch {
        setShowBgmFailToast(true);
      }

      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);

      loopTimerRef.current = setTimeout(() => {
        handleAutoStop();
      }, loopDurationMs);
    } catch {
      Alert.alert('', '녹음을 시작할 수 없어요. 마이크 권한을 확인해주세요');
      navigation.goBack();
    }
  }, [recorder, startBgm, handleAutoStop, loopDurationMs, navigation]);

  // ── 카운트다운 ──
  useEffect(() => {
    if (phase !== 'countdown') return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          startRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, startRecording]);

  // ── BGM 로드 실패 토스트 자동 숨김 (3초) ──
  useEffect(() => {
    if (!showBgmFailToast) return;
    failToastTimerRef.current = setTimeout(() => {
      setShowBgmFailToast(false);
    }, BGM_FAIL_TOAST_MS);
    return () => {
      if (failToastTimerRef.current) clearTimeout(failToastTimerRef.current);
    };
  }, [showBgmFailToast]);

  // ── iOS swipe-back 비활성화 ──
  useEffect(() => {
    (navigation as { setOptions?: (o: Record<string, unknown>) => void })
      .setOptions?.({ gestureEnabled: false });
  }, [navigation]);

  // ── metering → levels ──
  useEffect(() => {
    if (!recorderState.isRecording) return;
    const level = meteringToLevel(recorderState.metering);
    setLevels((prev) => [...prev.slice(-39), level]);
    levelsRef.current = [...levelsRef.current.slice(-39), level];
    if (level < SILENCE_THRESHOLD) {
      silentSecRef.current += 0.1;
      if (silentSecRef.current >= SILENCE_WARN_SEC) {
        setShowSilenceWarning(true);
      }
    } else {
      silentSecRef.current = 0;
      setShowSilenceWarning(false);
    }
  }, [recorderState]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [handleCancel]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (failToastTimerRef.current) clearTimeout(failToastTimerRef.current);
    };
  }, []);

  const formatTime = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  if (phase === 'countdown') {
    return (
      <View style={styles.countdownContainer}>
        <Pressable
          style={styles.cancelBtn}
          onPress={handleCancel}
          accessibilityLabel="녹음 취소"
          testID="cancel-recording-button"
        >
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.countdownNumber}>{countdown}</Text>
        <Text style={styles.countdownLabel}>녹음을 시작해요</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable
          onPress={handleCancel}
          accessibilityLabel="녹음 취소"
          testID="cancel-recording-button"
        >
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
      </View>

      {showBgmFailToast && (
        <Text style={styles.bgmFailToast}>음악 없이 녹음할게요</Text>
      )}

      {!bgmLoadFailed && isBgmPlaying && bgmTitle && (
        <Text style={styles.bgmChip}>{`♬ ${bgmTitle} · 30%`}</Text>
      )}

      <LyricsBox songKey={songKey} mode="recording" />

      <Text style={styles.encourageText}>더 많이 녹음할수록 더 풍성해집니다</Text>

      <View style={styles.waveformContainer}>
        <WaveformVisualizer mode="realtime" levels={levels} />
      </View>

      {showSilenceWarning && (
        <Text style={styles.silenceWarning}>소리가 감지되지 않아요</Text>
      )}

      <View style={styles.bottomRow}>
        <Pressable
          onPress={restartRecording}
          accessibilityLabel="다시 시작"
          testID="restart-recording-button"
          style={styles.restartBtn}
        >
          <Text style={styles.restartText}>다시 시작</Text>
        </Pressable>

        <Pressable
          style={styles.stopBtn}
          onPress={handleStopPress}
          accessibilityLabel="녹음 중지"
          testID="stop-recording-button"
        >
          <View style={styles.stopIcon} />
        </Pressable>

        <View style={styles.spacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownContainer: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownNumber: {
    color: '#5A7AA8',
    fontSize: 96,
    fontVariant: ['tabular-nums'],
    fontFamily: 'NotoSansKR-Regular',
  },
  countdownLabel: { color: '#7B80A0', fontSize: 16, marginTop: 12 },
  cancelBtn: { position: 'absolute', top: 48, left: 20 },
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  cancelText: { color: '#7B80A0', fontSize: 15 },
  timer: {
    ...Typography.timerMono,
  },
  bgmChip: {
    color: '#A9B0D0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  bgmFailToast: {
    color: '#E0B070',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  encourageText: {
    color: '#7B80A0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
  },
  silenceWarning: {
    color: '#5A8A6A',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 48,
    paddingHorizontal: 20,
  },
  restartBtn: {
    width: 80,
    paddingVertical: 8,
  },
  restartText: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'left',
  },
  spacer: { width: 80 },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIcon: {
    width: 26,
    height: 26,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
});
