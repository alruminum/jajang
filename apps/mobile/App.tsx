import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from '@navigation/RootNavigator';

// impl/07에서 Purchases.configure 추가
// impl/07에서 mobileAds().initialize() 추가

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0F1A" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: '#F5C97A',
            background: '#0D0F1A',
            card: '#12152B',
            text: '#EEF0F8',
            border: '#2A2E48',
            notification: '#F5C97A',
          },
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
