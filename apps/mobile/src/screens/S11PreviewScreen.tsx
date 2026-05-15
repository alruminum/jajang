// apps/mobile/src/screens/S11PreviewScreen.tsx
// S11 — 녹음 미리듣기 화면 (파형 미리보기 + 재생 + 업로드 + 서버 품질 검증)

import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// recordingsApi import 제거 — 호출 site 0 (task 10 local path 교체, REQ-003)
import { WaveformVisualizer } from '@components/WaveformVisualizer';
import { useRecordingStore } from '@store/recordingSlice';
import { useAuthStore } from '@store/authSlice';
import type { MainStackParamList } from '@navigation/types';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';
import { LocalDspService } from '../audio/local-dsp/LocalDspService';
import { LocalCounterRepo } from '../audio/local-dsp/LocalCounterRepo';
import { defaultDspBridge } from '../audio/local-dsp/MinimalDspBridge';

type Props = NativeStackScreenProps<MainStackParamList, 'Preview'>;

// task 10: local path 교체 후 phase 타입 갱신
type UploadPhase = 'idle' | 'checking_counter' | 'processing' | 'error';

export default function S11PreviewScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const {
    localAudioUri,
    selectedSongKey,
    recordingLevels,
    resetRecordingFlow,
  } = useRecordingStore();

  // entitlement 는 서버 path 보존용 — 현재 local path 에서는 미사용
  const { entitlement: _entitlement } = useAuthStore();

  // task 10: isGenerationExhausted 는 LocalCounterRepo.peek() 로 동적 결정 (handleUseRecording 내부)
  // 화면 렌더 시 배너는 표시하지 않음 — 버튼 탭 시에만 체크
  const isGenerationExhausted = false;

  // useRef: 테스트에서 mock constructor 가 render 시 호출되어 mock instance 반환
  const localCounterRef = React.useRef<LocalCounterRepo | null>(null);
  if (!localCounterRef.current) {
    localCounterRef.current = new LocalCounterRepo();
  }
  // LocalDspService instance — tests mock LocalDspService constructor
  const localServiceRef = React.useRef<LocalDspService | null>(null);
  if (!localServiceRef.current) {
    localServiceRef.current = new LocalDspService(defaultDspBridge, localCounterRef.current);
  }

  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // expo-audio 훅: localAudioUri 기반 player + status
  const player = useAudioPlayer(localAudioUri ? { uri: localAudioUri } : null);
  const status = useAudioPlayerStatus(player);

  // durationSec / positionSec (초 단위)
  const durationSec = status?.duration ?? 0;
  const positionSec = status?.currentTime ?? 0;

  // 재생 완료 감지 → 상태 초기화 + seek to 0
  useEffect(() => {
    if (status?.didJustFinish) {
      setIsPlaying(false);
      player.seekTo(0);
    }
  }, [status?.didJustFinish]);

  // expo-audio allowsRecording 복원 (S10에서 true로 설정됨) + 언마운트 정리
  useEffect(() => {
    if (!localAudioUri) {
      navigation.goBack();
      return;
    }

    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    });

    return () => {
      player.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 재생/정지 토글
  const handlePlayToggle = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  // 다시 녹음
  const handleReRecord = async () => {
    player.remove();
    // 로컬 파일 삭제 (재녹음 시 기존 파일 정리)
    if (localAudioUri) {
      await FileSystem.deleteAsync(localAudioUri, { idempotent: true });
    }
    resetRecordingFlow();
    // mode 파라미터 제거 (impl/13 — Record params에서 mode 필드 삭제)
    navigation.navigate('Record', {
      songKey: selectedSongKey ?? '',
    });
  };

  // 사용하기 → local DSP path (task 10 교체)
  // 기존 서버 path (recordingsApi.initUpload / uploadToS3 / completeUpload / validateSample) 는
  // Story 3 보존 정책으로 주석 처리 — 실행 경로에서 완전 제거 (impl §주의사항 §6)
  const handleUseRecording = async () => {
    if (!localAudioUri || !selectedSongKey) return;
    setErrorMessage(null);

    // ── 1. 카운터 체크 ──────────────────
    setPhase('checking_counter');
    const counter = await localCounterRef.current!.peek();
    if (counter.count >= counter.limit) {
      navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' });
      setPhase('idle');
      return;
    }

    // ── 2. LocalDspService.startJob ─────
    setPhase('processing');
    const outputUri = `${FileSystem.documentDirectory}lullaby_${Date.now()}.wav`;
    try {
      const jobId = await localServiceRef.current!.startJob({
        inputUri: localAudioUri,
        songKey: selectedSongKey,
        outputUri,
      });
      navigation.navigate('LocalGenerating', { jobId });
    } catch {
      setPhase('error');
      setErrorMessage('생성에 실패했어요. 다시 시도해주세요');
    }

    // ── 기존 서버 path (보존 — 실행 경로 외) ──────────────────────────────────
    // if (false) {
    //   const meteringLevels = recordingLevels.map(l => l * 60 - 60);
    //   const clientResult = validateFromMetadata(durationSec, meteringLevels);
    //   if (!clientResult.passed && clientResult.reason) { ... }
    //   const initRes = await recordingsApi.initUpload({ ... });
    //   await recordingsApi.uploadToS3(uploadUrl, localAudioUri, 'audio/wav');
    //   await recordingsApi.completeUpload(sampleId, { ... });
    //   const validateRes = await recordingsApi.validateSample(sampleId);
    //   navigation.navigate('Generating' as any, { sampleId, songKey: selectedSongKey });
    // }
  };

  const isProcessing = phase !== 'idle' && phase !== 'error';

  const phaseMessages: Record<UploadPhase, string> = {
    idle: '',
    checking_counter: '카운터를 확인하고 있어요',
    processing: '목소리를 처리하고 있어요',
    error: '',
  };

  const playbackPosition = durationSec > 0 ? positionSec / durationSec : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>이 목소리로 만들게요</Text>

      {/* 정적 파형 + 재생 컨트롤 */}
      <View style={styles.waveformCard}>
        <WaveformVisualizer
          mode="static"
          levels={recordingLevels}
          color={colors.accentSecondary}
          playbackPosition={playbackPosition}
        />
        <View style={styles.playbackRow}>
          <Pressable
            onPress={handlePlayToggle}
            accessibilityLabel={isPlaying ? '일시정지' : '재생'}
          >
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </Pressable>
          <Text style={styles.timecode}>
            {formatTime(positionSec)} / {formatTime(durationSec)}
          </Text>
        </View>
      </View>

      {/* 에러 메시지 */}
      {phase === 'error' && errorMessage != null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* 처리 중 상태 */}
      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color={colors.accentPrimary} style={{ marginRight: 8 }} />
          <Text style={styles.processingText}>{phaseMessages[phase]}</Text>
        </View>
      )}

      {/* 횟수 소진 배너 */}
      {isGenerationExhausted && (
        <View style={styles.exhaustedBanner}>
          <Text style={styles.exhaustedText}>⚠ 3회를 모두 썼어요</Text>
          <Text style={styles.exhaustedSub}>구독하면 계속 만들 수 있어요</Text>
        </View>
      )}

      {/* 버튼 영역 */}
      <View style={styles.buttonGroup}>
        <Pressable
          style={[styles.secondaryBtn, isProcessing && styles.btnDisabled]}
          onPress={handleReRecord}
          disabled={isProcessing}
          accessibilityLabel="다시 녹음"
        >
          <Text style={styles.secondaryBtnText}>다시 녹음할게요</Text>
        </Pressable>

        {isGenerationExhausted ? (
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Subscribe')}
            accessibilityLabel="구독하기"
          >
            <Text style={styles.primaryBtnText}>구독하기 →</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryBtn, isProcessing && styles.btnDisabled]}
            onPress={handleUseRecording}
            disabled={isProcessing}
            accessibilityLabel="이 목소리로 만들기"
          >
            <Text style={styles.primaryBtnText}>이 목소리로 만들기</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function formatTime(sec: number): string {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 20,
      fontFamily: 'NotoSansKR-Regular',
      marginBottom: 24,
    },
    waveformCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
    },
    playbackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
    },
    playIcon: {
      color: colors.accentSecondary,
      fontSize: 22,
      marginRight: 12,
    },
    timecode: {
      color: colors.textSecondary,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    errorBanner: {
      backgroundColor: colors.destructiveBg, // task 04 흡수 §3.2.2
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    errorText: {
      color: colors.errorText,
      fontSize: 14,
    },
    processingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    processingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    exhaustedBanner: {
      backgroundColor: colors.surfaceHigh,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    exhaustedText: {
      color: colors.successMuted,
      fontSize: 14,
      marginBottom: 4,
    },
    exhaustedSub: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    buttonGroup: {
      gap: 12,
      marginTop: 'auto',
      marginBottom: 32,
    },
    primaryBtn: {
      height: 56,
      backgroundColor: colors.accentPrimary,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryBtnText: {
      color: colors.bgPrimary,
      fontSize: 17,
      fontFamily: 'NotoSansKR-Regular',
    },
    secondaryBtn: {
      height: 52,
      backgroundColor: colors.surface,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: colors.accentSecondary,
      fontSize: 15,
    },
    btnDisabled: {
      opacity: 0.4,
    },
  });
