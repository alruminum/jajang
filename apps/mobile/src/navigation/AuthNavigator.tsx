import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';

import S02PrivacyScreen from '@screens/S02PrivacyScreen';
import S03OnboardingScreen from '@screens/S03OnboardingScreen';
import S04SignupScreen from '@screens/S04SignupScreen';
import S05LoginScreen from '@screens/S05LoginScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D0F1A' }, // 다크 미드나이트
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Privacy" component={S02PrivacyScreen} />
      <Stack.Screen name="Onboarding" component={S03OnboardingScreen} />
      <Stack.Screen name="Signup" component={S04SignupScreen} />
      <Stack.Screen name="Login" component={S05LoginScreen} />
    </Stack.Navigator>
  );
}
