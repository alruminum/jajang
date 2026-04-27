// apps/mobile/src/screens/RecordScreen.tsx
// S10 — 녹음 화면 (카운트다운 → 실시간 파형 → 자동/수동 종료 → S11 이동)

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  BackHandler,
} from 'react-native';
import { useAudioRecorder, useAudioRecorderState, setAudioModeAsync } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { IOSOutputFormat, AudioQuality } from 'expo-audio';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { useRecordingStore } from '../store/recordingSlice';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Record'>;

// ─────────────────────────────────────
// 상수
// ─────────────────────────────────────
const COUNTDOWN_START = 3;       // 카운트다운 초
const MIN_DURATION_SEC = 30;     // 최소 녹음 시간
const MAX_DURATION_SEC = 60;     // 최대 녹음 시간 (자동 종료)
const SILENCE_THRESHOLD = 0.02;  // 무음 감지 임계값 (정규화 레벨)
const SILENCE_WARN_SEC = 10;     // 무음 경고 표시 임계 시간

type ScreenPhase = 'countdown' | 'recording' | 'short_warning';

// ─────────────────────────────────────
// WAV PCM 녹음 옵션 (librosa SNR 분석에 최적)
// 60초 16kHz 16bit mono ≈ 1.9MB — LTE 업로드 무리 없음
// ─────────────────────────────────────
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

// ─────────────────────────────────────
// expo-audio metering → 0~1 레벨 변환
// expo-audio metering: 0~-160 dBFS 범위
// -60dB 이상을 1.0으로 클리핑 (실용 범위)
// ─────────────────────────────────────
function meteringToLevel(metering: number | undefined): number {
  if (metering === undefined || metering === 0) return 0;
  const clamped = Math.max(-60, metering);
  return (clamped + 60) / 60;
}

export function RecordScreen({ navigation, route }: Props) {
  const { setLocalAudioUri } = useRecordingStore();
  const { songKey } = route.params;

  // 화면 단계
  const [phase, setPhase] = useState<ScreenPhase>('countdown');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);

  // 녹음 상태
  const [elapsedSec, setElapsedSec] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [showSilenceWarning, setShowSilenceWarning] = useState(false);

  // expo-audio 훅
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);

  // refs (렌더 사이클 외부 상태)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silentSecRef = useRef(0); // 연속 무음 누적 시간 (0.1초 단위)
  const levelsRef = useRef<number[]>([]); // levels 최신값 추적

  // ── 카운트다운 ──────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── iOS swipe-back 제스처 비활성화 ──
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  // ── recorderState metering → levels 처리 ──
  useEffect(() => {
    if (!recorderState.isRecording) return;

    const level = meteringToLevel(recorderState.metering);

    // levels 배열 최대 40개 유지 (메모리 무한 증가 방지)
    setLevels((prev) => [...prev.slice(-39), level]);
    levelsRef.current = [...levelsRef.current.slice(-39), level];

    // 무음 감지 (연속 무음만 카운트)
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

  // ── 녹음 시작 ──────────────────────
  const startRecording = async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      setPhase('recording');

      // 경과 시간 타이머
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => {
          if (prev + 1 >= MAX_DURATION_SEC) {
            // 자동 종료
            clearInterval(timerRef.current!);
            handleAutoStop();
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      Alert.alert('', '녹음을 시작할 수 없어요. 마이크 권한을 확인해주세요');
      navigation.goBack();
    }
  };

  // ── 자동 종료 (60초) ───────────────
  const handleAutoStop = useCallback(async () => {
    await stopAndNavigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 수동 종료 버튼 탭 ──────────────
  const handleStopPress = async () => {
    if (elapsedSec < MIN_DURATION_SEC) {
      // 30초 미만 → 연장 유도 다이얼로그
      setPhase('short_warning');
      Alert.alert(
        '조금 더 녹음해주세요',
        '30초 이상 녹음하면 더 좋은 자장가를 만들 수 있어요',
        [
          { text: '이어서 할게요', onPress: () => setPhase('recording') },
          { text: '다시 시작', onPress: restartRecording },
        ],
      );
    } else {
      await stopAndNavigate();
    }
  };

  // ── 취소 버튼 탭 ───────────────────
  const handleCancel = () => {
    Alert.alert('녹음을 취소할까요?', '', [
      { text: '계속 녹음', style: 'cancel' },
      {
        text: '취소',
        style: 'destructive',
        onPress: async () => {
          await cleanupRecording();
          navigation.navigate('RecordMode');
        },
      },
    ]);
  };

  // ── 공통: 녹음 종료 + S11 이동 ─────
  const stopAndNavigate = async () => {
    const uri = await cleanupRecording();
    if (uri) {
      setLocalAudioUri(uri);
      navigation.navigate('Preview', { recordingUri: uri, songKey });
    }
  };

  // ── 재시작 ─────────────────────────
  const restartRecording = async () => {
    await cleanupRecording();
    setElapsedSec(0);
    setLevels([]);
    setCountdown(COUNTDOWN_START);
    silentSecRef.current = 0;
    levelsRef.current = [];
    setShowSilenceWarning(false);
    setPhase('countdown');
  };

  // ── 녹음 정리 ─────────────────────
  const cleanupRecording = async (): Promise<string | null> => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (!recorder.isRecording) return null;

    try {
      await recorder.stop();
      return recorder.uri ?? null;
    } catch {
      return null;
    }
  };

  // ── Android 뒤로 가기 가로채기 ─────
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSec]);

  // ── 언마운트 정리 ──────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // ────────────────────────────────────
  // 헬퍼
  // ────────────────────────────────────
  const formatTime = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // ────────────────────────────────────
  // 렌더 — 카운트다운 단계
  // ────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <View style={styles.countdownContainer}>
        <Pressable
          style={styles.cancelBtn}
          onPress={handleCancel}
          accessibilityLabel="녹음 취소"
        >
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.countdownNumber}>{countdown}</Text>
        <Text style={styles.countdownLabel}>녹음을 시작해요</Text>
      </View>
    );
  }

  // ────────────────────────────────────
  // 렌더 — 녹음 단계
  // ────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* 상단 바 */}
      <View style={styles.topBar}>
        <Pressable onPress={handleCancel} accessibilityLabel="녹음 취소">
          <Text style={styles.cancelText}>✕ 취소</Text>
        </Pressable>
        <Text style={styles.timer}>
          {formatTime(elapsedSec)} / {formatTime(MAX_DURATION_SEC)}
        </Text>
      </View>

      {/* 실시간 파형 */}
      <View style={styles.waveformContainer}>
        <WaveformVisualizer mode="realtime" levels={levels} />
      </View>

      {/* 30초 미달 안내 */}
      {elapsedSec < MIN_DURATION_SEC && (
        <Text style={styles.durationHint}>30초 채워주세요</Text>
      )}

      {/* 무음 경고 */}
      {showSilenceWarning && (
        <Text style={styles.silenceWarning}>소리가 감지되지 않아요</Text>
      )}

      {/* 중지 버튼 */}
      <Pressable
        style={styles.stopBtn}
        onPress={handleStopPress}
        accessibilityLabel="녹음 중지"
      >
        <View style={styles.stopIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── 카운트다운 ──
  countdownContainer: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownNumber: {
    color: '#5A7AA8',
    fontSize: 96,
    fontVariant: ['tabular-nums'], // 흔들림 방지 tabular numbers
    fontFamily: 'NotoSansKR-Regular',
  },
  countdownLabel: { color: '#7B80A0', fontSize: 16, marginTop: 12 },
  cancelBtn: { position: 'absolute', top: 48, left: 20 },

  // ── 녹음 ──
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
    color: '#7B80A0',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  waveformContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
  },
  durationHint: {
    color: '#7B80A0',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  silenceWarning: {
    color: '#5A8A6A',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 48,
  },
  stopIcon: {
    width: 26,
    height: 26,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
});
