---
depth: deep
design: required
---

# impl/05 — S04 회원가입 / S05 로그인 + 소셜 로그인

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 2 (이메일 가입), Story 3 (소셜 가입), Story 4 (로그인)  
**선행 조건**: impl/02 (서버 인증 API), impl/03 (네비게이터), impl/04 (동의 플래그)  
**예상 소요**: 6~8시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   ├── S04SignupScreen.tsx      [수정 — 실제 UI + API 연동]
│   └── S05LoginScreen.tsx       [수정 — 실제 UI + API 연동]
├── services/
│   ├── api.ts                   [신규 — axios 인스턴스 + 인터셉터]
│   └── auth-api.ts              [신규 — 인증 API 함수]
├── components/
│   └── SocialAuthButtons.tsx    [신규 — Apple/Google 버튼 공용 컴포넌트]
└── hooks/
    └── useAuth.ts               [신규 — 인증 상태 + 액션 훅]
```

---

## 2. axios 인스턴스

### services/api.ts

```typescript
import axios, { AxiosError, AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_BASE_URL =
  process.env.API_BASE_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000');

export const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// Request 인터셉터: access_token 자동 주입
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response 인터셉터: 401 시 refresh 시도
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('no refresh token');

        const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken });
        await SecureStore.setItemAsync('access_token', data.access_token);
        await SecureStore.setItemAsync('refresh_token', data.refresh_token);

        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return api(originalRequest);
      } catch {
        // refresh 실패 → 세션 만료 처리는 impl/06에서
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        throw error;
      }
    }
    throw error;
  },
);
```

**Android localhost 처리**: Android 에뮬레이터에서 `localhost`는 에뮬레이터 내부를 가리킴. 호스트 PC의 FastAPI는 `10.0.2.2:8000`으로 접근.  
**401 자동 refresh**: access_token 만료 시 1회 refresh 시도 → 성공 시 원 요청 재실행. 이 패턴은 모든 API 엔드포인트에 자동 적용.

---

## 3. 인증 API 함수

### services/auth-api.ts

```typescript
import { api } from './api';

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  entitlement: 'free' | 'trial' | 'premium';
  user_id: string;
}

export async function emailSignup(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/signup/email', { email, password });
  return data;
}

export async function emailLogin(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login/email', { email, password });
  return data;
}

export async function socialAuth(
  provider: 'apple' | 'google',
  idToken: string,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/social', {
    provider,
    id_token: idToken,
  });
  return data;
}
```

---

## 4. useAuth 훅 (기본 버전 — impl/06에서 확장)

```typescript
// src/hooks/useAuth.ts
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@store/auth-store';  // impl/06에서 정의
import { AuthResponse } from '@services/auth-api';

export function useAuth() {
  const { setAuth, clearAuth } = useAuthStore();

  const saveSession = async (authResponse: AuthResponse) => {
    await SecureStore.setItemAsync('access_token', authResponse.access_token);
    await SecureStore.setItemAsync('refresh_token', authResponse.refresh_token);
    setAuth({
      userId: authResponse.user_id,
      accessToken: authResponse.access_token,
      entitlement: authResponse.entitlement,
    });
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    clearAuth();
  };

  return { saveSession, logout };
}
```

---

## 5. SocialAuthButtons 공용 컴포넌트

```typescript
// src/components/SocialAuthButtons.tsx
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
      if (e.code === appleAuth.Error.CANCELED) return;  // 유저가 취소 — 에러 미처리
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
      if (e.code === 12501) return;  // Google: 유저 취소
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
    height: 56, borderRadius: 28, alignItems: 'center',
    justifyContent: 'center', flexDirection: 'row',
  },
  appleBtn: { backgroundColor: '#EEF0F8' },
  appleBtnText: { color: '#0D0F1A', fontSize: 15, fontWeight: '600' },
  googleBtn: { backgroundColor: '#1A1D30', borderWidth: 1, borderColor: '#2A2E48' },
  googleBtnText: { color: '#EEF0F8', fontSize: 15, fontWeight: '500' },
});
```

**Apple iOS 전용**: PRD F1 "Apple Sign-in (iOS 필수)". Android에서는 Apple 버튼 미노출.  
**취소 코드 처리**: Apple `Error.CANCELED`, Google `12501` — 유저가 직접 취소한 것이므로 에러 Alert 불필요.

---

## 6. S04 회원가입 화면

```typescript
// src/screens/S04SignupScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AxiosError } from 'axios';

import { AuthStackParamList, RootStackParamList } from '@navigation/types';
import { emailSignup, socialAuth } from '@services/auth-api';
import { useAuth } from '@hooks/useAuth';
import SocialAuthButtons from '@components/SocialAuthButtons';

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
      // impl/07에서 RevenueCat logIn 호출 추가
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
              onChangeText={(t) => { setEmail(t); setEmailError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="이메일 입력"
            />
            {emailError ? (
              <Text style={styles.errorText}>{emailError}</Text>
            ) : null}
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
              onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
              secureTextEntry
              accessibilityLabel="비밀번호 입력"
            />
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}
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

          <SocialAuthButtons onSuccess={handleSocialSuccess} />

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
    height: 52, backgroundColor: '#1A1D30', borderRadius: 12,
    paddingHorizontal: 16, color: '#EEF0F8', fontSize: 15,
    borderWidth: 1, borderColor: '#2A2E48',
  },
  inputError: { borderColor: '#E05F5F' },
  errorText: { color: '#E05F5F', fontSize: 12, marginTop: 6, marginLeft: 4 },
  inlineLink: { marginTop: 8 },
  inlineLinkText: { color: '#F5C97A', fontSize: 13 },
  primaryBtn: {
    height: 56, borderRadius: 28, backgroundColor: '#F5C97A',
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2E48' },
  dividerText: { color: '#7B80A0', marginHorizontal: 12, fontSize: 13 },
  loginLink: { alignItems: 'center', marginTop: 24 },
  loginLinkText: { color: '#7B80A0', fontSize: 14 },
});
```

---

## 7. S05 로그인 화면

```typescript
// src/screens/S05LoginScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Alert, StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AxiosError } from 'axios';

import { RootStackParamList } from '@navigation/types';
import { emailLogin, socialAuth } from '@services/auth-api';
import { useAuth } from '@hooks/useAuth';
import SocialAuthButtons from '@components/SocialAuthButtons';

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
    Alert.alert(
      '비밀번호 찾기',
      'support@jajang.app 으로 연락해주세요. (V1 임시 방법)',
      [{ text: '확인' }],
    );
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
              onChangeText={(t) => { setEmail(t); setLoginError(''); }}
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
              onChangeText={(t) => { setPassword(t); setLoginError(''); }}
              secureTextEntry
              accessibilityLabel="비밀번호 입력"
            />
          </View>

          {loginError ? (
            <Text style={styles.errorText}>{loginError}</Text>
          ) : null}

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

          <SocialAuthButtons onSuccess={handleSocialSuccess} />

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
    height: 52, backgroundColor: '#1A1D30', borderRadius: 12,
    paddingHorizontal: 16, color: '#EEF0F8', fontSize: 15,
    borderWidth: 1, borderColor: '#2A2E48',
  },
  errorText: { color: '#E05F5F', fontSize: 13, marginBottom: 12, marginLeft: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { color: '#7B80A0', fontSize: 13 },
  primaryBtn: {
    height: 56, borderRadius: 28, backgroundColor: '#F5C97A',
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2E48' },
  dividerText: { color: '#7B80A0', marginHorizontal: 12, fontSize: 13 },
  signupLink: { alignItems: 'center', marginTop: 24 },
  signupLinkText: { color: '#7B80A0', fontSize: 14 },
});
```

---

## 8. GoogleSignin 초기화 위치

`App.tsx` 또는 `S04SignupScreen` 마운트 전에 1회 설정 필요:

```typescript
// App.tsx에 추가 (impl/07에서 통합)
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});
```

---

## 9. 네이티브 설정 체크리스트

### iOS (Xcode)
- [ ] Signing & Capabilities: "Sign In with Apple" Capability 추가
- [ ] `Info.plist`: `CFBundleURLTypes` — Google OAuth redirect scheme 추가
  ```xml
  <key>CFBundleURLSchemes</key>
  <array>
    <string>com.googleusercontent.apps.{CLIENT_ID}</string>
  </array>
  ```

### Android
- [ ] `android/app/google-services.json` 다운로드 + 배치
- [ ] `android/app/build.gradle`: `apply plugin: 'com.google.gms.google-services'`
- [ ] `android/build.gradle`: Google Services classpath 추가

---

## 10. 수용 기준

- [ ] 올바른 이메일+비밀번호 입력 → 가입 성공 → Main 이동
- [ ] 이메일 형식 오류 → 인라인 에러 "올바른 이메일 형식이 아니에요"
- [ ] 비밀번호 8자 미만 → 인라인 에러 "비밀번호는 8자 이상이어야 해요"
- [ ] 중복 이메일 가입 → 409 에러 + "이미 등록된 이메일이에요" + "로그인하기 →" 링크 노출
- [ ] Apple 로그인 (iOS) → 성공 시 Main 이동, 취소 시 에러 없음
- [ ] Google 로그인 → 성공 시 Main 이동, 취소 시 에러 없음
- [ ] 소셜 로그인 실패 (네트워크) → Alert "소셜 로그인에 실패했어요"
- [ ] 잘못된 비밀번호 → "이메일 또는 비밀번호를 확인해주세요" (PRD 수용 기준)
- [ ] 기존 소셜 계정 재로그인 → 동일 계정 복원 (새 가입 아님)
- [ ] `loading=true` 중 버튼 disabled + "로그인 중..." 텍스트 표시

---

## 11. 주의사항

- `navigation.replace('Main')` 사용: `navigate` 대신 `replace`로 Auth 스택 제거. 뒤로가기 시 로그인 화면 복귀 방지.
- 비밀번호 찾기 V1 임시 처리: 이메일 재설정 엔드포인트(`POST /auth/forgot-password`)는 Epic 01 MVP 범위에 포함하지 않음. Alert + 지원 이메일 안내로 대체. Story 4 태스크 "비밀번호 찾기" 체크리스트 항목에 V1 임시 처리임을 명시.
- `KeyboardAvoidingView`: iOS는 `padding`, Android는 `height`. 혼용 금지 — Android에서 `padding`은 레이아웃 깨짐.
- 소셜 로그인 버튼 스타일: Apple은 `@invertase/react-native-apple-authentication`의 `AppleButton` 컴포넌트 대신 커스텀 TouchableOpacity 사용. 이유: UX Flow 다크 팔레트 커스텀 스타일 적용 필요. Apple HIG에서 커스텀 버튼 허용 (스타일 가이드라인 준수 필요 — 흰색 또는 검정 배경 + Apple 로고 포함).
