import React, { useEffect, useMemo } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import { RootStackParamList } from '@navigation/types';
import { getConsentFlag } from '@hooks/useConsentFlag';
import { useAuthStore } from '@store/auth-store';
import { api } from '@services/api';
import { useTheme } from '@hooks/useTheme';
import { ColorTokens } from '../theme/tokens';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function S01SplashScreen() {
  const navigation = useNavigation<NavProp>();
  const { clearAuth } = useAuthStore();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    const bootstrap = async () => {
      await new Promise(r => setTimeout(r, 1500));  // 최소 1.5초 스플래시 유지

      const consentGiven = await getConsentFlag();
      if (!consentGiven) {
        navigation.replace('Auth');
        return;
      }

      // SecureStore에서 토큰 검증 (Zustand persist는 참고용)
      const accessToken = await SecureStore.getItemAsync('access_token');
      const refreshToken = await SecureStore.getItemAsync('refresh_token');

      if (accessToken && isTokenValid(accessToken)) {
        // 유효한 access_token → Main 이동
        navigation.replace('Main');
      } else if (refreshToken) {
        // access 만료 + refresh 존재 → refresh 시도
        try {
          const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
          await SecureStore.setItemAsync('access_token', data.access_token);
          await SecureStore.setItemAsync('refresh_token', data.refresh_token);
          // Zustand isAuthenticated는 persist 복원으로 이미 true; 토큰만 SecureStore 갱신
          navigation.replace('Main');
        } catch {
          clearAuth();
          navigation.replace('Auth');
        }
      } else {
        clearAuth();
        // consent는 있는데 로그인 안 된 상태 → Auth(Login)으로
        navigation.replace('Auth');
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

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logo: {
      width: 120,
      height: 120,
      resizeMode: 'contain',
    },
  });
