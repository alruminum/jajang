import React, { useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import appleAuth from '@invertase/react-native-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useTheme } from '@hooks/useTheme';

interface Props {
  onSuccess: (provider: 'apple' | 'google', idToken: string) => void;
  onError?: (error: unknown) => void;
}

export default function SocialAuthButtons({ onSuccess, onError }: Props) {
  const { colors } = useTheme();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

  const styles = useMemo(() => StyleSheet.create({
    container: { gap: 12 },
    socialBtn: {
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
    },
    appleBtn: { backgroundColor: colors.textPrimary },
    appleBtnText: { color: colors.bgPrimary, fontSize: 15, fontWeight: '600' },
    googleBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    googleBtnText: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  }), [colors]);

  const handleApple = async () => {
    try {
      const credential = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
      if (!credential.identityToken) throw new Error('No identity token');
      onSuccess('apple', credential.identityToken);
    } catch (e: any) {
      if (e.code === appleAuth.Error.CANCELED) return;
      onError?.(e);
      Alert.alert('Apple 로그인 실패', '다시 시도해주세요');
    }
  };

  const handleGoogle = async () => {
    try {
      if (__DEV__ && !webClientId) {
        const mockToken = 'dev-mock-qa@jajang.com';
        onSuccess('google', mockToken);
        return;
      }
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') return;
      if (!response.data.idToken) throw new Error('No id token');
      onSuccess('google', response.data.idToken);
    } catch (e: any) {
      if (e.code === 12501) return;
      onError?.(e);
      Alert.alert('Google 로그인 실패', '다시 시도해주세요');
    }
  };

  return (
    <View style={styles.container}>
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
