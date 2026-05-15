// apps/mobile/src/screens/S12LocalGeneratingScreen.tsx
// S12 local path — LocalDspService job polling (task 10)
// 서버 polling 없이 로컬 DSP job 완료를 1초 간격으로 확인한다.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { useTheme } from '@hooks/useTheme';
import type { ColorTokens } from '../theme/tokens';
import { LocalDspService } from '../audio/local-dsp/LocalDspService';
import { LocalCounterRepo } from '../audio/local-dsp/LocalCounterRepo';
import { defaultDspBridge } from '../audio/local-dsp/MinimalDspBridge';
import GeneratingAnimation from '@components/GeneratingAnimation';

type Props = NativeStackScreenProps<MainStackParamList, 'LocalGenerating'>;

const POLL_INTERVAL_MS = 1000;

export default function S12LocalGeneratingScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { jobId } = route.params;
  const [isFailed, setIsFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // useRef: 테스트에서 mock constructor 가 render 시 호출되어 mock instance 반환
  const serviceRef = useRef<LocalDspService | null>(null);
  if (!serviceRef.current) {
    serviceRef.current = new LocalDspService(defaultDspBridge, new LocalCounterRepo());
  }

  useEffect(() => {
    const service = serviceRef.current!;
    const intervalId = setInterval(() => {
      const job = service.pollStatus(jobId);
      if (!job) return;

      if (job.status === 'completed') {
        clearInterval(intervalId);
        navigation.replace('Play', {
          trackId: jobId,
          trackUrl: job.outputUri ?? '',
        });
        return;
      }

      if (job.status === 'failed') {
        clearInterval(intervalId);
        setErrorMessage(job.error ?? '생성에 실패했어요');
        setIsFailed(true);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [jobId, navigation]);

  if (isFailed) {
    return (
      <View style={styles.container}>
        <View style={styles.center} testID="local-generating-error">
          <Text style={styles.errorText}>생성에 실패했어요</Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="뒤로 가기"
          >
            <Text style={styles.backBtnText}>돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <GeneratingAnimation />
        <Text style={styles.mainTitle}>
          아기를 위한 목소리를{'\n'}만들고 있어요
        </Text>
        <Text style={styles.subtitle}>· 잠시만 기다려주세요</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgPrimary },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    mainTitle: {
      color: colors.textPrimary,
      fontSize: 22,
      textAlign: 'center',
      lineHeight: 32,
      marginBottom: 12,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      textAlign: 'center',
      marginBottom: 24,
    },
    errorText: {
      color: colors.textPrimary,
      fontSize: 18,
      textAlign: 'center',
      marginBottom: 8,
    },
    errorDetail: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
    },
    backBtn: {
      paddingVertical: 12,
      paddingHorizontal: 32,
    },
    backBtnText: {
      color: colors.accentSecondary,
      fontSize: 16,
    },
  });
