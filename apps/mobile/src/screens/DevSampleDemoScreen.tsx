// apps/mobile/src/screens/DevSampleDemoScreen.tsx
// __DEV__ gate — 개발 빌드에서만 사용. production build 미포함 (REQ-007).
// sample fixture 합성 진입점 + LocalCounterRepo 카운터 표시.

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { localDspService } from '../audio/local-dsp/index';
import { LocalCounterRepo } from '../audio/local-dsp/LocalCounterRepo';
import { SAMPLE_VOICE } from '../assets/sample-fixtures';

const counterRepo = new LocalCounterRepo();

export default function DevSampleDemoScreen() {
  if (!__DEV__) {
    return null;
  }

  const [status, setStatus] = useState<string>('준비');
  const [outputUri, setOutputUri] = useState<string | null>(null);
  const [counterCount, setCounterCount] = useState<number | null>(null);

  const handleStartSynthesis = useCallback(async () => {
    setStatus('합성 시작...');
    setOutputUri(null);

    try {
      // task 08 fixture: voice-sample.wav
      // expo-asset Asset.fromModule 을 사용하지 않고 require() URI 직접 사용
      // Metro bundler 는 require() 를 정적 분석하여 번들에 포함시킴
      const inputUri = SAMPLE_VOICE as string;
      const outUri = `${FileSystem.documentDirectory}dev-sample-${Date.now()}.wav`;

      const jobId = await localDspService.startJob({
        inputUri,
        songKey: 'sample',
        outputUri: outUri,
      });

      if (__DEV__) {
        console.log('[DevSampleDemo] jobId:', jobId);
      }

      // pollStatus — job 이 동기로 완료되므로 즉시 체크
      const job = localDspService.pollStatus(jobId);
      if (job?.status === 'completed' && job.outputUri) {
        setOutputUri(job.outputUri);
        setStatus('완료');
        if (__DEV__) {
          console.log('[DevSampleDemo] outputUri:', job.outputUri);
        }
      } else if (job?.status === 'failed') {
        setStatus(`실패: ${job.error ?? '알 수 없는 오류'}`);
      } else {
        setStatus(`처리 중 (jobId: ${jobId})`);
      }

      // 카운터 확인
      const counter = await counterRepo.peek();
      setCounterCount(counter.count);
      if (__DEV__) {
        console.log('[DevSampleDemo] counter:', counter);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(`오류: ${message}`);
      if (__DEV__) {
        console.error('[DevSampleDemo] error:', err);
      }
    }
  }, []);

  const handleCheckCounter = useCallback(async () => {
    const counter = await counterRepo.peek();
    setCounterCount(counter.count);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dev Sample Demo</Text>
      <Text style={styles.subtitle}>__DEV__ 전용 — production build 미포함</Text>

      <Pressable onPress={handleStartSynthesis} style={styles.btn}>
        <Text style={styles.btnText}>샘플 합성 시작</Text>
      </Pressable>

      <Pressable onPress={handleCheckCounter} style={[styles.btn, styles.btnSecondary]}>
        <Text style={styles.btnText}>카운터 확인</Text>
      </Pressable>

      <View style={styles.resultBox}>
        <Text style={styles.label}>상태</Text>
        <Text style={styles.value}>{status}</Text>

        {outputUri && (
          <>
            <Text style={styles.label}>출력 URI</Text>
            <Text style={styles.valueSmall}>{outputUri}</Text>
          </>
        )}

        {counterCount !== null && (
          <>
            <Text style={styles.label}>카운터</Text>
            <Text style={styles.value}>{counterCount} / 3</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { color: '#aaa', fontSize: 13, marginBottom: 24 },
  btn: {
    backgroundColor: '#6cf',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnSecondary: { backgroundColor: '#444' },
  btnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  resultBox: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
  },
  label: { color: '#aaa', fontSize: 12, marginTop: 8 },
  value: { color: '#fff', fontSize: 16 },
  valueSmall: { color: '#9cf', fontSize: 12, marginTop: 4 },
});
