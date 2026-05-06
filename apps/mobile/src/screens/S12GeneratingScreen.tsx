// apps/mobile/src/screens/S12GeneratingScreen.tsx
// S12 — 생성 대기 화면 (impl/07 — sessions API + SecureStore pending 복원)
// polling / timeout_notice / completed / failed 4 분기

import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { MainStackParamList } from '@navigation/types';
import { useSessionPolling } from '@hooks/useSessionPolling';
import { clearPendingSession } from '@services/storage/pendingSession';
import { generateSession } from '@services/api/sessions';
import GeneratingAnimation from '@components/GeneratingAnimation';
import GeneratingTimeoutNotice from '@components/GeneratingTimeoutNotice';
import GeneratingFailureView from '@components/GeneratingFailureView';

type Props = NativeStackScreenProps<MainStackParamList, 'Generating'>;

export default function S12GeneratingScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const pollState = useSessionPolling(sessionId);

  useEffect(() => {
    if (pollState.kind === 'completed') {
      clearPendingSession();
      navigation.replace('Play', {
        trackId: sessionId,
        presignUrl: pollState.presignedUrl,
      });
    }
  }, [pollState, sessionId, navigation]);

  if (pollState.kind === 'timeout_notice') {
    return (
      <View style={styles.container}>
        <GeneratingTimeoutNotice
          onHome={() => navigation.navigate('HomeTabs')}
        />
      </View>
    );
  }

  if (pollState.kind === 'failed') {
    return (
      <View style={styles.container}>
        <GeneratingFailureView
          error={pollState.error}
          onRetry={async () => {
            // 동일 session_id 재요청 — 카운터 차감 X (impl/06)
            await generateSession(sessionId);
          }}
          onHome={() => navigation.navigate('HomeTabs')}
        />
      </View>
    );
  }

  // polling 상태 (completed는 useEffect에서 처리)
  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <GeneratingAnimation />
        <Text style={styles.mainTitle}>
          아기를 위한 목소리를{'\n'}만들고 있어요
        </Text>
        <Text style={styles.subtitle}>· 30초 이내에 자장가가 도착해요</Text>
        <Text style={styles.backgroundNotice}>앱을 닫아도 계속 만들고 있어요 ☁</Text>
        <Pressable
          onPress={() => navigation.navigate('HomeTabs')}
          accessibilityLabel="홈으로 이동"
        >
          <Text style={styles.homeLink}>홈으로 이동하기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  mainTitle: {
    color: '#EEF0F8',
    fontSize: 22,
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 12,
  },
  subtitle: {
    color: '#7B80A0',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  backgroundNotice: {
    color: '#7B80A0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 32,
  },
  homeLink: { color: '#C49A8A', fontSize: 15, textDecorationLine: 'underline' },
});
