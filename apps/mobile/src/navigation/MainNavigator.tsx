import React, { useMemo } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainStackParamList, HomeTabParamList } from './types';
import { useTheme } from '@hooks/useTheme';

// Tab screens
import S06HomeScreen from '@screens/S06HomeScreen';
import S16SettingsScreen from '@screens/S16SettingsScreen';

// Stack screens
import S07SongSelectScreen from '@screens/S07SongSelectScreen';
// RecordModeScreen (S08) — import 제거 (impl/13 폐기). 파일 삭제는 별도 클린업.
import { RecordGuideScreen } from '@screens/RecordGuideScreen';
import { RecordScreen } from '@screens/RecordScreen';
import S11PreviewScreen from '@screens/S11PreviewScreen';
import S12GeneratingScreen from '@screens/S12GeneratingScreen';
import S13PlayScreen from '@screens/S13PlayScreen';
import S14UpgradeSheet from '@screens/S14UpgradeSheet';
import S15SubscribeScreen from '@screens/S15SubscribeScreen';
import S17TrialExpiredScreen from '@screens/S17TrialExpiredScreen'
import AccountDeletionScreen from '@screens/AccountDeletionScreen';
import LegalScreen from '@screens/LegalScreen';

const Tab = createBottomTabNavigator<HomeTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function HomeTabs() {
  const { colors } = useTheme();
  const tabScreenOptions = useMemo(
    () => ({
      headerShown: false as const,
      tabBarStyle: {
        backgroundColor: colors.bgDeep,
        borderTopColor: colors.border,
      },
      tabBarActiveTintColor: colors.accentPrimary,
      tabBarInactiveTintColor: colors.textSecondary,
    }),
    [colors],
  );
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen name="Home" component={S06HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="Settings" component={S16SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  const { colors } = useTheme();
  const stackScreenOptions = useMemo(
    () => ({
      headerShown: false as const,
      contentStyle: { backgroundColor: colors.bgPrimary },
    }),
    [colors],
  );
  const legalOptions = useMemo(
    () => ({
      title: '법적 정보',
      headerShown: true,
      headerStyle: { backgroundColor: colors.bgPrimary },
      headerTintColor: colors.textPrimary,
    }),
    [colors],
  );
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name="HomeTabs" component={HomeTabs} />
      <Stack.Screen name="SongSelect" component={S07SongSelectScreen} />
      {/* RecordMode (S08) — Stack에서 제거 (impl/13 폐기) */}
      <Stack.Screen name="RecordGuide" component={RecordGuideScreen} />
      <Stack.Screen name="Record" component={RecordScreen} />
      <Stack.Screen name="Preview" component={S11PreviewScreen} />
      <Stack.Screen name="Generating" component={S12GeneratingScreen} />
      <Stack.Screen name="Play" component={S13PlayScreen} />
      <Stack.Screen
        name="Upgrade"
        component={S14UpgradeSheet}
        options={{ presentation: 'modal' }} // 바텀 시트 느낌
      />
      <Stack.Screen
        name="UpgradeSheet"
        component={S14UpgradeSheet}
        options={{ presentation: 'modal' }} // S07/S13 alias
      />
      <Stack.Screen name="Subscribe" component={S15SubscribeScreen} />
      <Stack.Screen
        name="TrialExpired"
        component={S17TrialExpiredScreen}
        options={{ presentation: 'modal', gestureEnabled: false }}
      />
      <Stack.Screen name="AccountDeletionFlow" component={AccountDeletionScreen} />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={legalOptions}
      />
    </Stack.Navigator>
  );
}
