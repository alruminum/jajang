import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import S01SplashScreen from '@screens/S01SplashScreen';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * 루트 네비게이터 — 세션 상태에 따라 Splash / Auth / Main 스택을 전환한다.
 *
 * S15 구독 화면(Subscribe)은 인증 이후 Main 스택(MainNavigator) 내에 등록되어 있다.
 * S14(UpgradeSheet) / S17(TrialExpired) → navigation.navigate('Subscribe') 경로로 진입한다.
 * 구독 완료 후 navigation.navigate('HomeTabs') 로 메인 홈으로 이동한다.
 */
export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={S01SplashScreen} />
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
