import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { RootStackParamList } from '@navigation/types';
import { jwtDecode } from 'jwt-decode';
import { getConsentFlag } from '@hooks/useConsentFlag';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function S01SplashScreen() {
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    const bootstrap = async () => {
      await new Promise(r => setTimeout(r, 1500));  // 최소 1.5초 스플래시 유지

      const consentGiven = await getConsentFlag();
      if (!consentGiven) {
        navigation.replace('Auth');  // AuthNavigator의 첫 화면 = Privacy
        return;
      }

      const accessToken = await SecureStore.getItemAsync('access_token');
      if (accessToken && isTokenValid(accessToken)) {
        navigation.replace('Main');
      } else {
        navigation.replace('Auth');
        // AuthNavigator 내부에서 Login으로 이동은 S02에서 처리
      }
    };
    bootstrap();
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/logo.png')}
        style={styles.logo}
        accessibilityLabel="자장 로고"
      />
    </View>
  );
}

function isTokenValid(token: string): boolean {
  try {
    const decoded = jwtDecode<{ exp: number }>(token);
    return decoded.exp * 1000 > Date.now() + 60_000;  // 1분 여유
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
});
