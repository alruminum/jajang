// apps/mobile/src/screens/S11PreviewScreen.tsx
// S11 — 녹음 미리듣기 화면 (파형 미리보기 + 재생 + 업로드 + 서버 품질 검증)

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { recordingsApi } from '@services/api/recordings';
import { validateFromMetadata, QUALITY_FAIL_MESSAGES } from '@utils/audio-quality';
import { WaveformVisualizer } from '@components/WaveformVisualizer';
import { useRecordingStore } from '@store/recordingSlice';
import { useAuthStore } from '@store/authSlice';
import type { MainStackParamList } from '@navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Preview'>;

type UploadPhase = 'idle' | 'validating_client' | 'uploading' | 'validating_server' | 'error';

export default function S11PreviewScreen({ navigation }: Props) {
  const {
    localAudioUri,
    selectedSongKey,
    recordingLevels,
    recordingMode,
    setUploadedSampleId,
    setQualityValidationPassed,
    resetRecordingFlow,
  } = useRecordingStore();

  const { entitlement } = useAuthStore();

  // TODO: generationCount not yet tracked in auth store — always false until auth-store is updated
  const isGenerationExhausted = false;

  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [positionSec, setPositionSec] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);

  // 녹음 파일 로드 + 길이 조회
  useEffect(() => {
    if (!localAudioUri) {
      navigation.goBack();
      return;
    }

    // expo-av allowsRecordingIOS 복원 (S10에서 true로 설정됨)
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    loadSound();

    return () => {
      soundRef.current?.unloadAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSound = async () => {
    if (!localAudioUri) return;

    const { sound, status } = await Audio.Sound.createAsync(
      { uri: localAudioUri },
      { shouldPlay: false },
      (s) => {
        if (s.isLoaded) {
          setPositionSec((s.positionMillis ?? 0) / 1000);
          if (s.didJustFinish) {
            setIsPlaying(false);
            sound.setPositionAsync(0);
          }
        }
      },
    );

    soundRef.current = sound;
    if (status.isLoaded) {
      setDurationSec((status.durationMillis ?? 0) / 1000);
    }
  };

  // 재생/정지 토글
  const handlePlayToggle = async () => {
    const sound = soundRef.current;
    if (!sound) return;

    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  // 다시 녹음
  const handleReRecord = async () => {
    await soundRef.current?.unloadAsync();
    // 로컬 파일 삭제 (재녹음 시 기존 파일 정리)
    if (localAudioUri) {
      await FileSystem.deleteAsync(localAudioUri, { idempotent: true });
    }
    resetRecordingFlow();
    navigation.navigate('Record', {
      songKey: selectedSongKey ?? '',
      mode: recordingMode ?? 'humming',
    });
  };

  // 사용하기 → 클라이언트 검증 + 업로드 + 서버 검증
  const handleUseRecording = async () => {
    if (!localAudioUri || !selectedSongKey) return;

    if (isGenerationExhausted) {
      navigation.navigate('UpgradeSheet', { variant: 'generation_exhausted' });
      return;
    }

    setPhase('validating_client');
    setErrorMessage(null);

    // ── 1. 클라이언트 1차 검증 ──────────
    // recordingLevels(0~1) → dBFS 근사 변환: level=1 → 0dBFS, level=0 → -60dBFS
    const meteringLevels = recordingLevels.map(l => l * 60 - 60);
    const clientResult = validateFromMetadata(durationSec, meteringLevels);

    if (!clientResult.passed && clientResult.reason) {
      setPhase('error');
      setErrorMessage(QUALITY_FAIL_MESSAGES[clientResult.reason]);
      return;
    }

    // ── 2. S3 업로드 presigned URL 요청 ─
    setPhase('uploading');
    let sampleId: string;
    let uploadUrl: string;

    try {
      // WAV 16kHz 16bit mono 기준 파일 크기 추정 (실제 파일 크기 접근 불필요)
      const estimatedFileSize = Math.round(durationSec * 16000 * 2);

      const initRes = await recordingsApi.initUpload({
        song_key: selectedSongKey,
        file_size_bytes: estimatedFileSize,
        content_type: 'audio/wav',
      });
      sampleId = initRes.sample_id;
      uploadUrl = initRes.upload_url;
    } catch {
      setPhase('error');
      setErrorMessage('업로드 준비에 실패했어요. 네트워크를 확인해주세요');
      return;
    }

    // ── 3. S3 직접 업로드 ───────────────
    try {
      await recordingsApi.uploadToS3(uploadUrl, localAudioUri, 'audio/wav');
    } catch {
      setPhase('error');
      setErrorMessage('파일 업로드에 실패했어요. 다시 시도해주세요');
      return;
    }

    // ── 4. 업로드 완료 통보 ─────────────
    try {
      await recordingsApi.completeUpload(sampleId, {
        sample_id: sampleId,
        duration_seconds: durationSec,
        rms_db: -20, // TODO: replace with actual PCM RMS after expo-audio migration
        peak_count: 0,
      });
    } catch {
      // 통보 실패는 치명적이지 않음 — 계속 진행
    }

    // ── 5. 서버 2차 검증 (SNR) ──────────
    setPhase('validating_server');
    try {
      const validateRes = await recordingsApi.validateSample(sampleId);
      if (!validateRes.passed) {
        setPhase('error');
        setErrorMessage(validateRes.message ?? '다시 녹음해주세요');
        return;
      }

      setUploadedSampleId(sampleId);
      setQualityValidationPassed(true);

      // Epic 03 연동: Generating 화면으로 이동
      // Generating 타입 정의는 Epic 03 완료 후 추가 예정 — 현재는 jobId 미정 (as any 임시)
      navigation.navigate('Generating' as any, {
        sampleId,
        songKey: selectedSongKey,
      });
    } catch {
      setPhase('error');
      setErrorMessage('네트워크를 확인해주세요');
    }
  };

  const isProcessing = phase !== 'idle' && phase !== 'error';

  const phaseMessages: Record<UploadPhase, string> = {
    idle: '',
    validating_client: '녹음 품질을 확인하고 있어요',
    uploading: '목소리를 업로드하고 있어요',
    validating_server: '샘플을 분석하고 있어요…',
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
          color="#8BAED4"
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
          <ActivityIndicator size="small" color="#F5C97A" style={{ marginRight: 8 }} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    color: '#EEF0F8',
    fontSize: 20,
    fontFamily: 'NotoSansKR-Regular',
    marginBottom: 24,
  },
  waveformCard: {
    backgroundColor: '#1A1D30',
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
    color: '#8BAED4',
    fontSize: 22,
    marginRight: 12,
  },
  timecode: {
    color: '#7B80A0',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    backgroundColor: '#2A1A1A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  processingText: {
    color: '#7B80A0',
    fontSize: 14,
  },
  exhaustedBanner: {
    backgroundColor: '#21253E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  exhaustedText: {
    color: '#E8A94A',
    fontSize: 14,
    marginBottom: 4,
  },
  exhaustedSub: {
    color: '#7B80A0',
    fontSize: 13,
  },
  buttonGroup: {
    gap: 12,
    marginTop: 'auto',
    marginBottom: 32,
  },
  primaryBtn: {
    height: 56,
    backgroundColor: '#F5C97A',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#0D0F1A',
    fontSize: 17,
    fontFamily: 'NotoSansKR-Regular',
  },
  secondaryBtn: {
    height: 52,
    backgroundColor: '#1A1D30',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#8BAED4',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.4,
  },
});
