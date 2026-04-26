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
import { emailSignup, socialAuth } from '@services/auth-api';
import { useAuth } from '@hooks/useAuth';
import SocialAuthButtons from '@components/SocialAuthButtons';
import { syncEntitlementAfterLogin } from '@services/revenue-cat';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function S04SignupScreen() {
  const navigation = useNavigation<NavProp>();
  const { saveSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignup = async () => {
    setEmailError('');
    setPasswordError('');

    // 클라이언트 1차 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('올바른 이메일 형식이 아니에요');
      return;
    }
    if (password.length < 8) {
      setPasswordError('비밀번호는 8자 이상이어야 해요');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setPasswordError('문자와 숫자를 모두 포함해주세요');
      return;
    }

    setLoading(true);
    try {
      const response = await emailSignup(email, password);
      await saveSession(response);
      await syncEntitlementAfterLogin(response.user_id);
      navigation.replace('Main');
    } catch (e) {
      if (e instanceof AxiosError) {
        if (e.response?.status === 409) {
          setEmailError('이미 등록된 이메일이에요');
          // "로그인하기" 버튼 노출 (수용 기준)
        } else {
          Alert.alert('가입 실패', '잠시 후 다시 시도해주세요');
        }
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
      Alert.alert('가입 실패', '소셜 로그인에 실패했어요. 다시 시도해주세요');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>시작할게요</Text>
          <Text style={styles.subtitle}>계정을 만들어 자장가를 만들어보세요</Text>

          {/* 이메일 입력 */}
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="이메일"
              placeholderTextColor="#7B80A0"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setEmailError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="이메일 입력"
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            {/* 이메일 중복 시 로그인 유도 버튼 */}
            {emailError === '이미 등록된 이메일이에요' && (
              <TouchableOpacity
                onPress={() => navigation.navigate('Auth', { screen: 'Login' } as any)}
                style={styles.inlineLink}
              >
                <Text style={styles.inlineLinkText}>로그인하기 →</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, passwordError ? styles.inputError : null]}
              placeholder="비밀번호 (8자 이상, 문자+숫자)"
              placeholderTextColor="#7B80A0"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setPasswordError('');
              }}
              secureTextEntry
              accessibilityLabel="비밀번호 입력"
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleEmailSignup}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="이메일로 가입하기"
          >
            <Text style={styles.primaryBtnText}>
              {loading ? '가입 중...' : '이메일로 가입할게요'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          <SocialAuthButtons
            onSuccess={handleSocialSuccess}
            onError={() => Alert.alert('가입 실패', '소셜 로그인에 실패했어요. 다시 시도해주세요')}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { screen: 'Login' } as any)}
            style={styles.loginLink}
          >
            <Text style={styles.loginLinkText}>이미 계정이 있어요</Text>
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
  inputError: { borderColor: '#E05F5F' },
  errorText: { color: '#E05F5F', fontSize: 12, marginTop: 6, marginLeft: 4 },
  inlineLink: { marginTop: 8 },
  inlineLinkText: { color: '#82B090', fontSize: 13 },
  primaryBtn: {
    height: 56,
    borderRadius: 28,
    backgroundColor: '#82B090',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2E48' },
  dividerText: { color: '#7B80A0', marginHorizontal: 12, fontSize: 13 },
  loginLink: { alignItems: 'center', marginTop: 24 },
  loginLinkText: { color: '#7B80A0', fontSize: 14 },
});
