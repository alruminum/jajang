import { NativeStackScreenProps } from '@react-navigation/native-stack';

// --- Root Stack ---
// 세션 상태에 따라 Auth / Main 스택 전환
export type RootStackParamList = {
  Splash: undefined;
  Auth: undefined;        // AuthNavigator
  Main: undefined;        // MainNavigator
};

// --- Auth Stack (S01~S05) ---
export type AuthStackParamList = {
  Privacy: undefined;     // S02
  Onboarding: undefined;  // S03
  Signup: undefined;      // S04
  Login: undefined;       // S05
};

// --- Main Stack ---
// BottomTab(Home, Settings) + Modal/Stack 화면들
export type MainStackParamList = {
  HomeTabs: undefined;
  SongSelect: undefined;                  // S07
  RecordGuide: { songKey: string };       // S09 — mode 제거 (impl/13)
  Record: { songKey: string };            // S10 — mode 제거 (impl/13)
  Preview: { recordingUri: string; songKey: string };          // S11
  Generating: {
    sessionId: string;  // sessions API session_id (impl/07)
  };                                                           // S12
  Play: { trackId: string; trackUrl?: string; presignUrl?: string; songKey?: string }; // S13
  Upgrade: {                             // S14 (legacy)
    variant: 'background' | 'generation-exhausted';
  };
  UpgradeSheet: {                        // S14 alias used by S07
    variant: 'background' | 'generation_exhausted';
  };
  Subscribe: undefined;                  // S15
  TrialExpired: undefined;               // S17
  AccountDeletionFlow: undefined;        // S18 — 계정 탈퇴 (impl/04)
  Legal: undefined;                      // 법적 정보 (impl/05)
};

// --- Tab Param List ---
export type HomeTabParamList = {
  Home: undefined;      // S06
  Settings: undefined;  // S16
};

// --- Screen Props 타입 헬퍼 ---
export type SplashScreenProps = NativeStackScreenProps<RootStackParamList, 'Splash'>;
export type SignupScreenProps = NativeStackScreenProps<AuthStackParamList, 'Signup'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type HomeScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeTabs'>;
export type PlayScreenProps = NativeStackScreenProps<MainStackParamList, 'Play'>;
export type UpgradeSheetProps = NativeStackScreenProps<MainStackParamList, 'Upgrade'>;
