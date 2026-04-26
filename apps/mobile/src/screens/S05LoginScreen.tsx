import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AxiosError } from 'axios';

import { RootStackParamList } from '@navigation/types';
import { emailLogin, socialAuth } from '@services/auth-api';
import { useAuth } from '@hooks/useAuth';
import SocialAuthButtons from '@components/SocialAuthButtons';
import { syncEntitlementAfterLogin } from '@services/revenue-cat';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function S05LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const { saveSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoginError('');
    if (!email || !password) {
      setLoginError('이메일과 비밀번호를 입력해주세요');
      return;
    }
    setLoading(true);
    try {
      const response = await emailLogin(email, password);
      await saveSession(response);
      await syncEntitlementAfterLogin(response.user_id);
      navigation.replace('Main');
    } catch (e) {
      if (e instanceof AxiosError && e.response?.status === 401) {
        setLoginError('이메일 또는 비밀번호를 확인해주세요');
      } else {
        Alert.alert('로그인 실패', '잠시 후 다시 시도해주세요');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSuccess = async (provider: 'apple' | 'google', idToken: string) => {
    setLoading(true);
    try {
      const response = await socialAuth(provider, idToken);
      await saveSession(response);
      await syncEntitlementAfterLogin(response.user_id);
      navigation.replace('Main');
    } catch {
      Alert.alert('로그인 실패', '소셜 로그인에 실패했어요. 다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // V1: 이메일 재설정 — 서버 엔드포인트 `POST /auth/forgot-password`는 Epic 01 범위 외
    // 임시: Alert로 이메일 안내
    Alert.alert('비밀번호 찾기', 'support@jajang.app 으로 연락해주세요. (V1 임시 방법)', [
      { text: '확인' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>다시 돌아왔어요</Text>
          <Text style={styles.subtitle}>계정에 로그인해주세요</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="이메일"
              placeholderTextColor="#7B80A0"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setLoginError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="이메일 입력"
            />
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder="비밀번호"
              placeholderTextColor="#7B80A0"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setLoginError('');
              }}
              secureTextEntry
              accessibilityLabel="비밀번호 입력"
            />
          </View>

          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

          <TouchableOpacity
            onPress={handleForgotPassword}
            style={styles.forgotBtn}
            accessibilityRole="button"
            accessibilityLabel="비밀번호를 잊으셨나요"
          >
            <Text style={styles.forgotText}>비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="로그인하기"
          >
            <Text style={styles.primaryBtnText}>
              {loading ? '로그인 중...' : '로그인할게요'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          <SocialAuthButtons
            onSuccess={handleSocialSuccess}
            onError={() => Alert.alert('로그인 실패', '소셜 로그인에 실패했어요. 다시 시도해주세요')}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { screen: 'Signup' } as any)}
            style={styles.signupLink}
          >
            <Text style={styles.signupLinkText}>계정이 없으신가요? 가입하기</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  scroll: { padding: 24, flexGrow: 1 },
  title: { fontSize: 26, fontWeight: '700', color: '#EEF0F8', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#7B80A0', marginBottom: 32 },
  inputGroup: { marginBottom: 16 },
  input: {
    height: 52,
    backgroundColor: '#1A1D30',
    borderRadius: 12,
    paddingHorizontal: 16,
    color: '#EEF0F8',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2A2E48',
  },
  errorText: { color: '#E05F5F', fontSize: 13, marginBottom: 12, marginLeft: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { color: '#7B80A0', fontSize: 13 },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#82B090',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2E48' },
  dividerText: { color: '#7B80A0', marginHorizontal: 12, fontSize: 13 },
  signupLink: { alignItems: 'center', marginTop: 24 },
  signupLinkText: { color: '#7B80A0', fontSize: 14 },
});
