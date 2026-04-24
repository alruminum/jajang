---
depth: std
design: required
---

# impl/04 — S01 스플래시 / S02 개인정보 동의 / S03 온보딩

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: Story 1 (개인정보 동의 화면)  
**선행 조건**: impl/03 완료 (네비게이터 + placeholder)  
**예상 소요**: 4~5시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/
├── screens/
│   ├── S01SplashScreen.tsx      [수정 — 세션 분기 로직 추가]
│   ├── S02PrivacyScreen.tsx     [수정 — 실제 UI 구현]
│   └── S03OnboardingScreen.tsx  [수정 — 실제 UI 구현]
├── hooks/
│   └── useConsentFlag.ts        [신규 — 동의 플래그 AsyncStorage 관리]
└── assets/
    └── onboarding/              [신규 — 온보딩 이미지 3장 (추후 디자이너 산출물로 교체)]
```

---

## 2. S01 스플래시 — 세션 분기

### 핵심 로직

```
앱 실행
  ├─ privacy_consent_given = false (AsyncStorage) → Auth/Privacy
  ├─ session_token 유효 (SecureStore) → Main/Home
  └─ session_token 없음/만료 → Auth/Privacy 또는 Auth/Login
```

**분기 상세**:
- `AsyncStorage: 'consent_given'` = `'true'` 가 없으면 → Privacy 화면 (최우선)
- consent 있음 + SecureStore `access_token` 유효 → Main (자동 로그인)
- consent 있음 + 토큰 없음/만료 → Login 화면

```typescript
// src/screens/S01SplashScreen.tsx
import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { RootStackParamList } from '@navigation/types';
import { jwtDecode } from 'jwt-decode';  // npm install jwt-decode

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function S01SplashScreen() {
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    const bootstrap = async () => {
      await new Promise(r => setTimeout(r, 1500));  // 최소 1.5초 스플래시 유지

      const consentGiven = await AsyncStorage.getItem('consent_given');
      if (consentGiven !== 'true') {
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
```

**`jwt-decode` 선택 이유**: 클라이언트에서 토큰 만료만 확인. 서명 검증은 불필요 (서버가 담당). `jose` 라이브러리 대비 번들 크기 작음.

---

## 3. useConsentFlag 훅

```typescript
// src/hooks/useConsentFlag.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'consent_given';
const CONSENT_VERSION_KEY = 'consent_version';
const CURRENT_CONSENT_VERSION = '1';  // 정책 변경 시 버전 업

export async function getConsentFlag(): Promise<boolean> {
  const [given, version] = await Promise.all([
    AsyncStorage.getItem(CONSENT_KEY),
    AsyncStorage.getItem(CONSENT_VERSION_KEY),
  ]);
  return given === 'true' && version === CURRENT_CONSENT_VERSION;
}

export async function setConsentFlag(): Promise<void> {
  await AsyncStorage.multiSet([
    [CONSENT_KEY, 'true'],
    [CONSENT_VERSION_KEY, CURRENT_CONSENT_VERSION],
  ]);
}

export async function clearConsentFlag(): Promise<void> {
  await AsyncStorage.multiRemove([CONSENT_KEY, CONSENT_VERSION_KEY]);
}
```

**consent_version 설계 이유**: 개인정보처리방침이 변경되면 `CURRENT_CONSENT_VERSION`을 올림 → 기존 동의 무효화 → 재동의 요구 가능. PRD/GDPR에서 동의 변경 시 재동의 필요.

---

## 4. S02 개인정보 동의 화면

### UI 구성

```
┌─────────────────────────────┐
│ 목소리 수집 동의              │  (헤드라인, 웜 앰버)
│                              │
│ ─ 수집 항목: 음성 샘플        │
│ ─ 보관 기간: 생성 완료 후     │
│   24시간 이내 자동 삭제       │
│ ─ 목적: AI 자장가 생성        │
│ ─ 제3자 제공: 없음            │
│                              │
│ [전문 보기 →]                │  (외부 URL 열기)
│                              │
│ ☐ [필수] 목소리 수집 및      │
│         처리에 동의해요       │
│                              │
│ ────────────────────────── │
│ 동의하고 시작할게요  [비활성]  │  (필수 체크 전 비활성)
│                              │
│ 동의하지 않을게요             │  (종료 안내 다이얼로그)
└─────────────────────────────┘
```

```typescript
// src/screens/S02PrivacyScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView,
  StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';
import { setConsentFlag } from '@hooks/useConsentFlag';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Privacy'>;

const PRIVACY_URL = 'https://jajang.app/privacy';  // 실제 URL로 교체 필요

export default function S02PrivacyScreen() {
  const navigation = useNavigation<NavProp>();
  const [agreed, setAgreed] = useState(false);

  const handleAgree = async () => {
    await setConsentFlag();
    navigation.navigate('Onboarding');
  };

  const handleDecline = () => {
    Alert.alert(
      '동의가 필요해요',
      '목소리 수집에 동의해야 자장가를 만들 수 있어요. 동의 없이는 앱을 사용하기 어려워요.',
      [
        { text: '다시 생각해볼게요', style: 'cancel' },
        { text: '앱 종료', style: 'destructive', onPress: () => {
          // BackHandler.exitApp() — Android 전용. iOS는 앱 강제 종료 불가
          // iOS에서는 안내만 표시
        }},
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>목소리 수집 동의</Text>
        <Text style={styles.subtitle}>자장가를 만들기 위해 아래 내용을 확인해주세요</Text>

        <View style={styles.card}>
          {CONSENT_ITEMS.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.bullet}>·</Text>
              <View style={styles.rowContent}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(PRIVACY_URL)}
          accessibilityRole="link"
          accessibilityLabel="개인정보처리방침 전문 보기"
        >
          <Text style={styles.link}>개인정보처리방침 전문 보기 →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAgreed(!agreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="[필수] 목소리 수집 및 처리에 동의해요"
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>[필수] 목소리 수집 및 처리에 동의해요</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, !agreed && styles.primaryBtnDisabled]}
          onPress={handleAgree}
          disabled={!agreed}
          accessibilityRole="button"
          accessibilityLabel="동의하고 시작할게요"
          accessibilityState={{ disabled: !agreed }}
        >
          <Text style={[styles.primaryBtnText, !agreed && styles.primaryBtnTextDisabled]}>
            동의하고 시작할게요
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDecline}
          style={styles.secondaryBtn}
          accessibilityRole="button"
          accessibilityLabel="동의하지 않을게요"
        >
          <Text style={styles.secondaryBtnText}>동의하지 않을게요</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const CONSENT_ITEMS = [
  { title: '수집 항목', desc: '음성 샘플 (30~60초 녹음)' },
  { title: '보관 기간', desc: '자장가 생성 완료 후 24시간 이내 서버에서 자동 삭제' },
  { title: '이용 목적', desc: 'AI 자장가 생성에만 사용, 다른 목적 불가' },
  { title: '제3자 제공', desc: '없음' },
  { title: '목소리 주의', desc: '본인 목소리만 녹음해주세요. 제3자 목소리 업로드는 금지돼요' },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  scroll: { padding: 24, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#F5C97A', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#7B80A0', marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: '#1A1D30', borderRadius: 16, padding: 20, marginBottom: 16 },
  row: { flexDirection: 'row', marginBottom: 14 },
  bullet: { color: '#F5C97A', marginRight: 8, marginTop: 2 },
  rowContent: { flex: 1 },
  itemTitle: { color: '#EEF0F8', fontSize: 14, fontWeight: '500', marginBottom: 2 },
  itemDesc: { color: '#7B80A0', fontSize: 13, lineHeight: 18 },
  link: { color: '#8BAED4', fontSize: 13, marginBottom: 24 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: '#7B80A0', marginRight: 12, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#F5C97A', borderColor: '#F5C97A' },
  checkmark: { color: '#0D0F1A', fontSize: 13, fontWeight: '700' },
  checkLabel: { color: '#EEF0F8', fontSize: 14, flex: 1 },
  footer: { padding: 24, paddingTop: 8 },
  primaryBtn: {
    backgroundColor: '#F5C97A', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  primaryBtnDisabled: { backgroundColor: '#2A2E48' },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  primaryBtnTextDisabled: { color: '#7B80A0' },
  secondaryBtn: { alignItems: 'center', padding: 12 },
  secondaryBtnText: { color: '#7B80A0', fontSize: 14 },
});
```

**iOS 앱 종료 불가 설계**: Apple 가이드라인에서 `exit(0)` 사용 금지. 미동의 시 앱 종료 옵션을 제공하되 실제 강제 종료는 Android `BackHandler.exitApp()`만 사용. iOS에서는 "설정을 변경하려면 앱을 다시 실행해주세요" 안내로 대체.

---

## 5. S03 온보딩 화면 (3슬라이드)

### 슬라이드 구성

```
슬라이드 1: "30초 목소리로"
  - 일러스트: 마이크/파형
  - "30초만 목소리를 들려주세요"
  - "아기가 좋아하는 자장가가 만들어져요"

슬라이드 2: "내 목소리로 만드는"
  - 일러스트: 아기/달
  - "AI가 내 목소리로"
  - "특별한 자장가를 만들어줘요"

슬라이드 3: "편안한 수면을"
  - 일러스트: 잠든 아기
  - "오늘 밤부터 시작해요"
  - 버튼: "가입하고 시작할게요" + "이미 계정이 있어요"
```

```typescript
// src/screens/S03OnboardingScreen.tsx
import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@navigation/types';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>;

const SLIDES = [
  {
    id: '1',
    title: '30초 목소리로',
    body: '30초만 목소리를 들려주세요\n아기가 좋아하는 자장가가 만들어져요',
    emoji: '🎙️',
  },
  {
    id: '2',
    title: '내 목소리로 만드는',
    body: 'AI가 내 목소리로\n특별한 자장가를 만들어줘요',
    emoji: '🌙',
  },
  {
    id: '3',
    title: '편안한 수면을',
    body: '오늘 밤부터 시작해요',
    emoji: '🍃',
    isLast: true,
  },
];

export default function S03OnboardingScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NavProp>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        onMomentumScrollEnd={e => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideBody}>{item.body}</Text>
          </View>
        )}
      />

      {/* 페이지 인디케이터 */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, currentIndex === i && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA — 마지막 슬라이드에서만 표시 */}
      {currentIndex === SLIDES.length - 1 ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
            accessibilityLabel="가입하고 시작할게요"
          >
            <Text style={styles.primaryBtnText}>가입하고 시작할게요</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            accessibilityRole="button"
            accessibilityLabel="이미 계정이 있어요"
          >
            <Text style={styles.secondaryLink}>이미 계정이 있어요</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="다음"
          >
            <Text style={styles.nextBtnText}>다음</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Signup')}
            accessibilityRole="button"
            accessibilityLabel="건너뛰기"
          >
            <Text style={styles.skipText}>건너뛸게요</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emoji: { fontSize: 64, marginBottom: 32 },
  slideTitle: {
    fontSize: 24, fontWeight: '600', color: '#F5C97A',
    textAlign: 'center', marginBottom: 16,
  },
  slideBody: {
    fontSize: 15, color: '#7B80A0', textAlign: 'center', lineHeight: 22,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2A2E48', marginHorizontal: 4 },
  dotActive: { backgroundColor: '#F5C97A', width: 18 },
  footer: { padding: 24 },
  primaryBtn: {
    backgroundColor: '#F5C97A', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  primaryBtnText: { color: '#0D0F1A', fontSize: 16, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#1A1D30', height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  nextBtnText: { color: '#EEF0F8', fontSize: 16, fontWeight: '500' },
  secondaryLink: { color: '#7B80A0', textAlign: 'center', fontSize: 14, padding: 12 },
  skipText: { color: '#7B80A0', textAlign: 'center', fontSize: 14, padding: 12 },
});
```

**이모지 사용**: UX Flow에서 일러스트 디자인 미확정 상태. placeholder로 이모지 사용. 디자이너 산출물 수령 후 `Image` 컴포넌트로 교체.

---

## 6. 수용 기준

- [ ] 앱 첫 실행 → S02 개인정보 동의 화면 진입 (consent_given 없음)
- [ ] S02: 필수 항목 미체크 시 "동의하고 시작할게요" 버튼 비활성(배경 `#2A2E48`)
- [ ] S02: 체크 후 버튼 활성 + 탭 → S03 온보딩 이동
- [ ] S02: "동의하지 않을게요" 탭 → Alert 다이얼로그 (한국어 메시지)
- [ ] S03: FlatList 스와이프로 슬라이드 전환 가능
- [ ] S03: 마지막 슬라이드에서 "가입하고 시작할게요" → S04, "이미 계정이 있어요" → S05
- [ ] 앱 재실행 (consent_given='true') → S02 스킵 → 세션 분기
- [ ] VoiceOver/TalkBack: 체크박스 `accessibilityRole="checkbox"` 및 `accessibilityState` 정상
- [ ] "개인정보처리방침 전문 보기" 탭 → 외부 브라우저 오픈

---

## 7. 주의사항

- `consent_version` 관리: 향후 개인정보처리방침 변경 시 `CURRENT_CONSENT_VERSION` 상수를 올려야 기존 유저 재동의 요구 가능. 상수는 `useConsentFlag.ts`에서 중앙 관리.
- S01의 `isTokenValid` 1분 여유값: access_token 만료 1분 전 Splash에서 Main 대신 Login으로 분기. 앱 진입 직후 API 호출 중 만료되는 엣지케이스 방지.
- 온보딩 이미지 교체 시 `require('../assets/onboarding/slide1.png')` 패턴 사용. web URL 이미지는 초기 로딩 지연 → 금지.
- impl/06 (세션 관리) 완료 후 S01의 `isTokenValid` 로직을 세션 훅으로 통합 리팩토링 필요.
