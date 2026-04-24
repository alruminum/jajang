---
depth: std
---

# impl/03 — React Navigation v7 설정 + 화면 Placeholder 17개

**Epic**: 01 — 인증 & 온보딩  
**커버 스토리**: 전체 앱 선행 (화면 골격)  
**선행 조건**: impl/00 완료 (모바일 앱 package.json, tsconfig)  
**예상 소요**: 3~4시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/
├── App.tsx                              [수정 — NavigationContainer 추가]
└── src/
    ├── navigation/
    │   ├── RootNavigator.tsx            [신규 — 최상위 Stack]
    │   ├── AuthNavigator.tsx            [신규 — 인증 플로우 Stack]
    │   ├── MainNavigator.tsx            [신규 — 로그인 후 Tab + Stack]
    │   └── types.ts                     [신규 — 네비게이션 타입 정의]
    └── screens/
        ├── S01SplashScreen.tsx          [신규 — placeholder]
        ├── S02PrivacyScreen.tsx         [신규 — placeholder]
        ├── S03OnboardingScreen.tsx      [신규 — placeholder]
        ├── S04SignupScreen.tsx          [신규 — placeholder]
        ├── S05LoginScreen.tsx           [신규 — placeholder]
        ├── S06HomeScreen.tsx            [신규 — placeholder]
        ├── S07SongSelectScreen.tsx      [신규 — placeholder]
        ├── S08RecordModeScreen.tsx      [신규 — placeholder]
        ├── S09RecordGuideScreen.tsx     [신규 — placeholder]
        ├── S10RecordScreen.tsx          [신규 — placeholder]
        ├── S11PreviewScreen.tsx         [신규 — placeholder]
        ├── S12GeneratingScreen.tsx      [신규 — placeholder]
        ├── S13PlayScreen.tsx            [신규 — placeholder]
        ├── S14UpgradeSheet.tsx          [신규 — placeholder]
        ├── S15SubscribeScreen.tsx       [신규 — placeholder]
        ├── S16SettingsScreen.tsx        [신규 — placeholder]
        └── S17TrialExpiredScreen.tsx    [신규 — placeholder]
```

---

## 2. 네비게이션 타입 정의

### src/navigation/types.ts

```typescript
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

// --- Root Stack ---
// 세션 상태에 따라 Auth / Main 스택 전환
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;         // AuthNavigator
  Main: undefined;         // MainNavigator
};

// --- Auth Stack (S01~S05) ---
export type AuthStackParamList = {
  Privacy: undefined;      // S02
  Onboarding: undefined;  // S03
  Signup: undefined;       // S04
  Login: undefined;        // S05
};

// --- Main Stack ---
// BottomTab(Home, Settings) + Modal/Stack 화면들
export type MainStackParamList = {
  HomeTabs: undefined;
  SongSelect: undefined;                  // S07
  RecordMode: { songKey: string };        // S08
  RecordGuide: { songKey: string; mode: 'humming' | 'shh' }; // S09
  Record: { songKey: string; mode: 'humming' | 'shh' };      // S10
  Preview: { recordingUri: string; songKey: string };          // S11
  Generating: { jobId: string; songKey: string };              // S12
  Play: { trackId: string };             // S13
  Upgrade: {                             // S14
    variant: 'background' | 'generation-exhausted';
  };
  Subscribe: undefined;                  // S15
  TrialExpired: undefined;               // S17
};

// --- Tab Param List ---
export type HomeTabParamList = {
  Home: undefined;          // S06
  Settings: undefined;      // S16
};

// --- Screen Props 타입 헬퍼 ---
export type SplashScreenProps = NativeStackScreenProps<RootStackParamList, 'Splash'>;
export type SignupScreenProps = NativeStackScreenProps<AuthStackParamList, 'Signup'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type HomeScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeTabs'>;
export type RecordModeScreenProps = NativeStackScreenProps<MainStackParamList, 'RecordMode'>;
export type PlayScreenProps = NativeStackScreenProps<MainStackParamList, 'Play'>;
export type UpgradeSheetProps = NativeStackScreenProps<MainStackParamList, 'Upgrade'>;
```

**타입 설계 결정**:
- `RootStackParamList`에 `Splash`를 포함: 초기 세션 분기를 Splash에서 처리 후 `replace`로 Auth 또는 Main 이동.
- `MainStackParamList`에 Tab + 모든 플로우 화면 혼합: BottomTab을 nested로 두되 생성 플로우(S07~S13)와 모달(S14, S17)은 탭 위 스택에 올림. 탭 내부에 복잡한 스택 중첩 없이 단순 구조 유지.
- `songKey`, `mode`, `jobId`를 params으로 전달: 화면 간 prop drilling 없이 네비게이션 params 활용.

---

## 3. 네비게이터 구현

### src/navigation/RootNavigator.tsx

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

import S01SplashScreen from '@screens/S01SplashScreen';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={S01SplashScreen} />
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
```

### src/navigation/AuthNavigator.tsx

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';

import S02PrivacyScreen from '@screens/S02PrivacyScreen';
import S03OnboardingScreen from '@screens/S03OnboardingScreen';
import S04SignupScreen from '@screens/S04SignupScreen';
import S05LoginScreen from '@screens/S05LoginScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D0F1A' },  // 다크 미드나이트
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Privacy" component={S02PrivacyScreen} />
      <Stack.Screen name="Onboarding" component={S03OnboardingScreen} />
      <Stack.Screen name="Signup" component={S04SignupScreen} />
      <Stack.Screen name="Login" component={S05LoginScreen} />
    </Stack.Navigator>
  );
}
```

### src/navigation/MainNavigator.tsx

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainStackParamList, HomeTabParamList } from './types';

// Tab screens
import S06HomeScreen from '@screens/S06HomeScreen';
import S16SettingsScreen from '@screens/S16SettingsScreen';

// Stack screens
import S07SongSelectScreen from '@screens/S07SongSelectScreen';
import S08RecordModeScreen from '@screens/S08RecordModeScreen';
import S09RecordGuideScreen from '@screens/S09RecordGuideScreen';
import S10RecordScreen from '@screens/S10RecordScreen';
import S11PreviewScreen from '@screens/S11PreviewScreen';
import S12GeneratingScreen from '@screens/S12GeneratingScreen';
import S13PlayScreen from '@screens/S13PlayScreen';
import S14UpgradeSheet from '@screens/S14UpgradeSheet';
import S15SubscribeScreen from '@screens/S15SubscribeScreen';
import S17TrialExpiredScreen from '@screens/S17TrialExpiredScreen';

const Tab = createBottomTabNavigator<HomeTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#12152B',
          borderTopColor: '#2A2E48',
        },
        tabBarActiveTintColor: '#F5C97A',
        tabBarInactiveTintColor: '#7B80A0',
      }}
    >
      <Tab.Screen name="Home" component={S06HomeScreen} options={{ title: '홈' }} />
      <Tab.Screen name="Settings" component={S16SettingsScreen} options={{ title: '설정' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D0F1A' },
      }}
    >
      <Stack.Screen name="HomeTabs" component={HomeTabs} />
      <Stack.Screen name="SongSelect" component={S07SongSelectScreen} />
      <Stack.Screen name="RecordMode" component={S08RecordModeScreen} />
      <Stack.Screen name="RecordGuide" component={S09RecordGuideScreen} />
      <Stack.Screen name="Record" component={S10RecordScreen} />
      <Stack.Screen name="Preview" component={S11PreviewScreen} />
      <Stack.Screen name="Generating" component={S12GeneratingScreen} />
      <Stack.Screen name="Play" component={S13PlayScreen} />
      <Stack.Screen
        name="Upgrade"
        component={S14UpgradeSheet}
        options={{ presentation: 'modal' }}  // 바텀 시트 느낌
      />
      <Stack.Screen name="Subscribe" component={S15SubscribeScreen} />
      <Stack.Screen
        name="TrialExpired"
        component={S17TrialExpiredScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
```

**탭 구조 결정**: PRD/UX Flow에 하단 탭 명시 없음. S06(홈)과 S16(설정) 두 탭만 존재. 설정을 별도 탭으로 두는 이유 — 탭 네비게이션 없이 설정을 접근하려면 헤더 아이콘이 필요하나, 다크 다운 앱에서 헤더를 최소화하기 위해 탭 배치. 탭 아이콘은 impl/04~08에서 추가.

---

## 4. App.tsx 수정

```typescript
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from '@navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#0D0F1A" />
      <NavigationContainer
        theme={{
          dark: true,
          colors: {
            primary: '#F5C97A',
            background: '#0D0F1A',
            card: '#12152B',
            text: '#EEF0F8',
            border: '#2A2E48',
            notification: '#F5C97A',
          },
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
```

`NavigationContainer`의 `theme` 설정으로 React Navigation 내부 기본 색상 전체를 다크 미드나이트 팔레트로 교체. UX Flow 디자인 가이드 직접 반영.

---

## 5. Placeholder 화면 패턴

모든 17개 placeholder는 동일한 패턴을 따름:

```typescript
// src/screens/S06HomeScreen.tsx 예시
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function S06HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.label}>[S06] 홈</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#7B80A0',
    fontSize: 14,
  },
});
```

**placeholder 작성 규칙**:
- 파일마다 `default export` 함수 컴포넌트 필수 (Navigator import 에러 방지)
- `backgroundColor: '#0D0F1A'` 고정 (흰 화면 깜빡임 방지)
- 화면 ID + 이름 텍스트 표시 (개발 중 식별용)
- `SafeAreaView` 래핑 (노치/홈 인디케이터 대응)

---

## 6. 수용 기준

- [ ] `npx expo start` → 앱 기동 후 `[S01] 스플래시` 텍스트 노출
- [ ] S01에서 `navigation.replace('Auth')` 호출 시 S02 Privacy 화면 이동
- [ ] S01에서 `navigation.replace('Main')` 호출 시 S06 Home 탭 이동
- [ ] TypeScript `tsc --noEmit` 에러 없음 (타입 파라미터 전체 일치)
- [ ] Android에서도 동일 동작 확인 (탭바 색상 포함)
- [ ] `S14Upgrade`는 modal presentation으로 렌더 (iOS: 아래에서 올라오는 애니메이션)

---

## 7. 주의사항

- `S14UpgradeSheet`는 `presentation: 'modal'` 스택 화면. Bottom Sheet 라이브러리(`@gorhom/bottom-sheet` 등) **미사용** — V1에서 의존성 최소화. 실제 구현 시 반 화면 높이 View로 처리.
- 생성 플로우(S07~S12)는 탭 내부가 아닌 루트 스택에 올라감. 따라서 S07 진입 시 탭바 자동 숨김됨 (React Navigation 기본 동작).
- `@navigation/RootNavigator` path alias: impl/00에서 설정한 `babel.config.js` + `tsconfig.json` 필수 적용 전제.
- Splash → Auth/Main 분기 로직 실제 구현은 **impl/06 (세션 관리)** 담당. 이 impl에서는 placeholder만.
