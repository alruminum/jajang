import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { initializeAdMob } from '@services/adMobService';
import RootNavigator from '@navigation/RootNavigator';
import { sessionEvents, SESSION_EXPIRED_EVENT } from '@lib/session-events';
import { useAuth } from '@hooks/useAuth';
import { RootStackParamList } from '@navigation/types';
import { configurePurchases } from '@services/revenue-cat';
import { useEntitlementSync } from '@hooks/useEntitlement';

// 앱 레벨 1회 초기화 (컴포넌트 외부 — 어떤 화면도 열리기 전 SDK 준비)
configurePurchases();

GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
  offlineAccess: false,
});

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * 세션 만료 이벤트 구독 컴포넌트
 * NavigationContainer 밖에 위치 — navigationRef로 직접 리셋
 * (useNavigation은 Navigator 컨텍스트가 필요하므로 ref 패턴 사용)
 */
function SessionExpiredListener() {
  const { handleSessionExpired } = useAuth();

  useEffect(() => {
    const handler = async () => {
      await handleSessionExpired();
      if (navigationRef.isReady()) {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Auth' }],
        });
      }
    };
    sessionEvents.on(SESSION_EXPIRED_EVENT, handler);
    return () => { sessionEvents.off(SESSION_EXPIRED_EVENT, handler); };
  }, []);

  return null;
}

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#F5C97A',
    background: '#0D0F1A',
    card: '#12152B',
    text: '#EEF0F8',
    border: '#2A2E48',
    notification: '#F5C97A',
  },
};

export default function App() {
  // entitlement 동기화 (포그라운드 복귀 + 실시간 리스너)
  useEntitlementSync();

  useEffect(() => {
    // AdMob 초기화 (첫 광고 요청 전 완료 필요 — adMobService)
    initializeAdMob().catch(console.warn);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0F1A" />
      <SessionExpiredListener />
      <NavigationContainer ref={navigationRef} theme={AppTheme}>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
