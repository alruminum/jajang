import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// impl/03에서 NavigationContainer + RootNavigator 추가
// impl/07에서 Purchases.configure 추가
// impl/07에서 mobileAds().initialize() 추가

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* RootNavigator will be added in impl/03 */}
    </SafeAreaProvider>
  );
}
