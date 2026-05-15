/**
 * SpikeNs2Screen — Hermes 실기기 측정 진입 화면
 *
 * ⚠️  SPIKE ONLY — prod 번들 포함 금지.
 *     측정 완료 후 navigator import 및 본 파일 제거 의무.
 *
 * 사용 방법:
 *   apps/mobile/src/navigation/MainNavigator.tsx 에 아래 임시 라인 추가:
 *     import SpikeNs2Screen from '@screens/SpikeNs2Screen';
 *     <Stack.Screen name="SpikeNs2" component={SpikeNs2Screen} />
 *
 *   DevMenu 에서 'SpikeNs2' 화면으로 이동하거나
 *   실행 환경에서 navigation.navigate('SpikeNs2') 호출.
 *
 *   adb logcat 필터:
 *     adb logcat | grep -E "SPIKE_NS2|RESULT:"
 *
 * 참조: apps/mobile/scripts/spike-ns2-pure-js-perf.md
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { runSpike } from '../../scripts/spike-ns2-pure-js-perf';

type SpikeStatus = 'idle' | 'running' | 'done' | 'error';

const SpikeNs2Screen: React.FC = () => {
  const [status, setStatus] = useState<SpikeStatus>('idle');
  const [logLines, setLogLines] = useState<string[]>([]);

  const handleRunSpike = useCallback(async () => {
    setStatus('running');
    setLogLines([]);

    // Intercept console.log to capture SPIKE_NS2 lines in the UI as well
    const originalLog = console.log.bind(console);
    const captured: string[] = [];

    console.log = (...args: unknown[]) => {
      originalLog(...args);
      const line = args.map(String).join(' ');
      if (line.includes('SPIKE_NS2') || line.includes('RESULT:')) {
        captured.push(line);
        setLogLines([...captured]);
      }
    };

    try {
      await runSpike();
      setStatus('done');
    } catch (e) {
      captured.push(`ERROR: ${String(e)}`);
      setLogLines([...captured]);
      setStatus('error');
    } finally {
      console.log = originalLog;
    }
  }, []);

  const statusText: Record<SpikeStatus, string> = {
    idle: 'Ready — tap "Run Spike" to start',
    running: 'Running spike measurement... (watch adb logcat)',
    done: 'Spike complete. See adb logcat for full output.',
    error: 'Spike errored. See log below.',
  };

  return (
    <View style={styles.container} testID="spike-ns2-screen">
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} testID="spike-title">NS2 Pure-JS DSP Spike</Text>
        <Text style={styles.subtitle}>
          {Platform.OS.toUpperCase()} — Hermes measurement
        </Text>
      </View>

      {/* Status */}
      <View style={styles.statusRow}>
        {status === 'running' && <ActivityIndicator testID="spike-loading" />}
        <Text style={styles.statusText} testID="spike-status">
          {statusText[status]}
        </Text>
      </View>

      {/* Run button */}
      <TouchableOpacity
        style={[styles.runButton, status === 'running' && styles.runButtonDisabled]}
        onPress={handleRunSpike}
        disabled={status === 'running'}
        testID="run-spike-button"
        accessibilityLabel="Run Spike"
        accessibilityRole="button"
      >
        <Text style={styles.runButtonText}>
          {status === 'running' ? 'Measuring...' : 'Run Spike'}
        </Text>
      </TouchableOpacity>

      {/* Log output area */}
      <ScrollView
        style={styles.logScroll}
        testID="spike-log-scroll"
        contentContainerStyle={styles.logContent}
      >
        <Text style={styles.logHeader} testID="spike-log-area">
          --- adb logcat output (SPIKE_NS2 lines) ---
        </Text>
        {logLines.length === 0 ? (
          <Text style={styles.logEmpty} testID="spike-log-empty">
            (no output yet — run spike to see results here)
          </Text>
        ) : (
          logLines.map((line, i) => (
            <Text key={i} style={styles.logLine} selectable>
              {line}
            </Text>
          ))
        )}
      </ScrollView>

      {/* Warning */}
      <View style={styles.warningBox}>
        <Text style={styles.warningText}>
          ⚠ SPIKE ONLY — remove navigator import after measurement
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e0e0e0',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 24,
  },
  statusText: {
    fontSize: 13,
    color: '#aaa',
    flex: 1,
  },
  runButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  runButtonDisabled: {
    backgroundColor: '#444',
  },
  runButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logScroll: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  logContent: {
    padding: 8,
  },
  logHeader: {
    color: '#555',
    fontSize: 11,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logEmpty: {
    color: '#444',
    fontSize: 12,
    fontStyle: 'italic',
  },
  logLine: {
    color: '#b5e853',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  warningBox: {
    backgroundColor: '#2a1a00',
    borderRadius: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: '#664400',
  },
  warningText: {
    color: '#ffaa44',
    fontSize: 11,
  },
});

export default SpikeNs2Screen;
