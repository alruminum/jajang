import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import appleAuth from '@invertase/react-native-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

interface Props {
  onSuccess: (provider: 'apple' | 'google', idToken: string) => void;
  onError?: (error: unknown) => void;
}

export default function SocialAuthButtons({ onSuccess, onError }: Props) {
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
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      if (!userInfo.idToken) throw new Error('No id token');
      onSuccess('google', userInfo.idToken);
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
