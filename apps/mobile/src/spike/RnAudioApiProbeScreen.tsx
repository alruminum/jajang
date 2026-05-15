/**
 * NS3 Spike — react-native-audio-api Expo Bare probe
 *
 * 목적: AudioContext + OscillatorNode + DelayNode + GainNode 노드 그래프가
 *       Expo Bare (RN 0.83.6 / Expo 55) 에서 빌드 및 실행되는지 검증.
 *
 * 동작: 버튼 1-tap → OscillatorNode(440Hz) → DelayNode(1000ms) → GainNode(0.3)
 *       → AudioContext.destination 으로 5초간 echo-like sound 출력 후 자동 종료.
 *
 * 진입: App.tsx 의 __DEV__ 조건 분기로만 진입 (prod 영향 0).
 * 제거: NS4 진입 시 본 파일 삭제 + App.tsx 분기 제거.
 *
 * API 출처: node_modules/react-native-audio-api/lib/typescript/index.d.ts (직접 read)
 * 버전: react-native-audio-api@0.12.2
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  AudioContext,
  OscillatorNode,
  DelayNode,
  GainNode,
} from 'react-native-audio-api';

type ProbeStatus = 'idle' | 'running' | 'stopped' | 'error';

interface LogEntry {
  ts: string;
  msg: string;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export default function RnAudioApiProbeScreen(): React.JSX.Element {
  const [status, setStatus] = useState<ProbeStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const contextRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function addLog(msg: string) {
    setLogs(prev => [...prev, { ts: timestamp(), msg }]);
    console.log('[NS3-Probe]', msg);
  }

  async function stopDemo() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    try {
      if (oscRef.current) {
        oscRef.current.stop();
        oscRef.current = null;
        addLog('OscillatorNode stopped');
      }
      if (contextRef.current) {
        await contextRef.current.close();
        contextRef.current = null;
        addLog('AudioContext closed');
      }
      setStatus('stopped');
      addLog('Demo stopped. C2 node graph teardown OK.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog('ERROR on stop: ' + msg);
      setStatus('error');
    }
  }

  async function startDemo() {
    if (status === 'running') {
      return;
    }
    setLogs([]);
    setStatus('running');
    addLog('--- NS3 probe start ---');

    try {
      // 1. AudioContext 생성
      const ctx = new AudioContext();
      contextRef.current = ctx;
      addLog('AudioContext created. sampleRate=' + ctx.sampleRate + ' state=' + ctx.state);

      // 2. OscillatorNode (440Hz sine = 청각 확인 기준음)
      const osc = ctx.createOscillator();
      oscRef.current = osc;
      osc.type = 'sine';
      osc.frequency.value = 440;
      addLog('OscillatorNode created. freq=440Hz type=sine');

      // 3. DelayNode (1000ms = 1초 echo delay, impl §3.1.A aecho 1000ms 대응)
      const delay: DelayNode = ctx.createDelay(2.0);
      delay.delayTime.value = 1.0;
      addLog('DelayNode created. delayTime=1.0s maxDelayTime=2.0s');

      // 4. GainNode (wet gain = 0.3, impl §3.1.A aecho decay 0.3 대응)
      const gainWet: GainNode = ctx.createGain();
      gainWet.gain.value = 0.3;
      addLog('GainNode (wet) created. gain=0.3');

      // 5. 노드 그래프 연결:
      //    osc → delay → gainWet → destination  (echo path)
      //    osc → destination                     (dry path)
      osc.connect(delay);
      delay.connect(gainWet);
      gainWet.connect(ctx.destination);
      osc.connect(ctx.destination);
      addLog('Node graph connected: osc→delay→gainWet→dest + osc→dest');

      // 6. OscillatorNode start
      osc.start();
      addLog('OscillatorNode started. Echo demo running for 5s...');

      // 7. 5초 후 자동 종료
      stopTimerRef.current = setTimeout(async () => {
        addLog('5s elapsed — auto-stopping...');
        await stopDemo();
      }, 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog('ERROR: ' + msg);
      setStatus('error');
      // cleanup 시도
      await stopDemo();
    }
  }

  const buttonLabel = status === 'running' ? 'Stop Demo' : 'Start Echo Demo (1-tap)';
  const onPress = status === 'running' ? stopDemo : startDemo;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NS3 — react-native-audio-api Probe</Text>
      <Text style={styles.subtitle}>v0.12.2 | AudioContext + DelayNode + GainNode echo demo</Text>

      <TouchableOpacity
        style={[styles.button, status === 'error' && styles.buttonError]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>{buttonLabel}</Text>
      </TouchableOpacity>

      <Text style={styles.statusLabel}>
        Status: <Text style={styles.statusValue}>{status}</Text>
      </Text>

      <Text style={styles.logHeader}>Log:</Text>
      <ScrollView style={styles.logBox} contentContainerStyle={styles.logContent}>
        {logs.map((entry, i) => (
          <Text key={i} style={styles.logLine}>
            [{entry.ts}] {entry.msg}
          </Text>
        ))}
        {logs.length === 0 && (
          <Text style={styles.logPlaceholder}>Tap "Start Echo Demo" to begin.</Text>
        )}
      </ScrollView>

      <Text style={styles.footer}>
        MP3_EXPORT: not_found (FileFormat enum: Wav / Caf / M4A / Flac only){'\n'}
        NS4 note: C2 MP3 export requires additional bridge (-1 score)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    color: '#F5C97A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#8A8FB0',
    fontSize: 12,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#F5C97A',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonError: {
    backgroundColor: '#E05252',
  },
  buttonText: {
    color: '#0D0F1A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusLabel: {
    color: '#EEF0F8',
    marginBottom: 12,
    fontSize: 14,
  },
  statusValue: {
    color: '#F5C97A',
    fontWeight: 'bold',
  },
  logHeader: {
    color: '#8A8FB0',
    fontSize: 12,
    marginBottom: 4,
  },
  logBox: {
    flex: 1,
    backgroundColor: '#12152B',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  logContent: {
    flexGrow: 1,
  },
  logLine: {
    color: '#C8CEEE',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  logPlaceholder: {
    color: '#4A4F70',
    fontSize: 12,
    fontStyle: 'italic',
  },
  footer: {
    color: '#6A6F90',
    fontSize: 10,
    textAlign: 'center',
  },
});
