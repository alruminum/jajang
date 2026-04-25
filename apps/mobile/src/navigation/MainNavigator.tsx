import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainStackParamList, HomeTabParamList } from './types';

// Tab screens
import S06HomeScreen from '@screens/S06HomeScreen';
import S16SettingsScreen from '@screens/S16SettingsScreen';

// Stack screens
import S07SongSelectScreen from '@screens/S07SongSelectScreen';
import S08RecordModeScreen from '@screens/S08RecordModeScreen';
import S09RecordGuideScreen from '@screens/S09RecordGuideScreen';
import S10RecordScreen from '@screens/S10RecordScreen';
import S11PreviewScreen from '@screens/S11PreviewScreen';
import S12GeneratingScreen from '@screens/S12GeneratingScreen';
import S13PlayScreen from '@screens/S13PlayScreen';
import S14UpgradeSheet from '@screens/S14UpgradeSheet';
import S15SubscribeScreen from '@screens/S15SubscribeScreen';
import S17TrialExpiredScreen from '@screens/S17TrialExpiredScreen';

const Tab = createBottomTabNavigator<HomeTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#12152B',
          borderTopColor: '#2A2E48',
        },
        tabBarActiveTintColor: '#F5C97A',
        tabBarInactiveTintColor: '#7B80A0',
      }}
    >
      <Tab.Screen name="Home" component={S06HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="Settings" component={S16SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D0F1A' },
      }}
    >
      <Stack.Screen name="HomeTabs" component={HomeTabs} />
      <Stack.Screen name="SongSelect" component={S07SongSelectScreen} />
      <Stack.Screen name="RecordMode" component={S08RecordModeScreen} />
      <Stack.Screen name="RecordGuide" component={S09RecordGuideScreen} />
      <Stack.Screen name="Record" component={S10RecordScreen} />
      <Stack.Screen name="Preview" component={S11PreviewScreen} />
      <Stack.Screen name="Generating" component={S12GeneratingScreen} />
      <Stack.Screen name="Play" component={S13PlayScreen} />
      <Stack.Screen
        name="Upgrade"
        component={S14UpgradeSheet}
        options={{ presentation: 'modal' }} // 바텀 시트 느낌
      />
      <Stack.Screen name="Subscribe" component={S15SubscribeScreen} />
      <Stack.Screen
        name="TrialExpired"
        component={S17TrialExpiredScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
