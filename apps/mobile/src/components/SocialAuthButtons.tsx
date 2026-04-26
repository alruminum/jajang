import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import appleAuth from '@invertase/react-native-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

interface Props {
  onSuccess: (provider: 'apple' | 'google', idToken: string) => void;
  onError?: (error: unknown) => void;
}

export default function SocialAuthButtons({ onSuccess, onError }: Props) {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

  const handleApple = async () => {
    try {
      const credential = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
      if (!credential.identityToken) throw new Error('No identity token');
      onSuccess('apple', credential.identityToken);
    } catch (e: any) {
      if (e.code === appleAuth.Error.CANCELED) return; // 유저가 취소 — 에러 미처리
      onError?.(e);
      Alert.alert('Apple 로그인 실패', '다시 시도해주세요');
    }
  };

  const handleGoogle = async () => {
    try {
      // ── dev 환경 mock 분기 ──────────────────────────────────────────
      // webClientId 미설정(개발 환경) 시 native Google Sign-In 스킵.
      // MOCK_GOOGLE_AUTH=true 서버와 쌍으로 동작.
      // mock id_token 형식: "dev-mock-<email>" — 서버가 email로 파싱 가능.
      if (__DEV__ && !webClientId) {
        const mockToken = 'dev-mock-qa@jajang.com';
        onSuccess('google', mockToken);
        return;
      }
      // ──────────────────────────────────────────────────────────────────

      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') return; // 유저 취소
      if (!response.data.idToken) throw new Error('No id token');
      onSuccess('google', response.data.idToken);
    } catch (e: any) {
      if (e.code === 12501) return; // Google: 유저 취소
      onError?.(e);
      Alert.alert('Google 로그인 실패', '다시 시도해주세요');
    }
  };

  return (
    <View style={styles.container}>
      {/* Apple: iOS만 노출 (PRD F1: "iOS 필수") */}
      {Platform.OS === 'ios' && (
        <TouchableOpacity
          style={[styles.socialBtn, styles.appleBtn]}
          onPress={handleApple}
          accessibilityRole="button"
          accessibilityLabel="Apple로 계속하기"
        >
          <Text style={styles.appleBtnText}>  Apple로 계속하기</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.socialBtn, styles.googleBtn]}
        onPress={handleGoogle}
        accessibilityRole="button"
        accessibilityLabel="Google로 계속하기"
      >
        <Text style={styles.googleBtnText}>  Google로 계속하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  socialBtn: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  appleBtn: { backgroundColor: '#EEF0F8' },
  appleBtnText: { color: '#0D0F1A', fontSize: 15, fontWeight: '600' },
  googleBtn: { backgroundColor: '#1A1D30', borderWidth: 1, borderColor: '#2A2E48' },
  googleBtnText: { color: '#EEF0F8', fontSize: 15, fontWeight: '500' },
});
