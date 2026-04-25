import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

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
  Home: undefined;      // S06
  Settings: undefined;  // S16
};

// --- Screen Props 타입 헬퍼 ---
export type SplashScreenProps = NativeStackScreenProps<RootStackParamList, 'Splash'>;
export type SignupScreenProps = NativeStackScreenProps<AuthStackParamList, 'Signup'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type HomeScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeTabs'>;
export type RecordModeScreenProps = NativeStackScreenProps<MainStackParamList, 'RecordMode'>;
export type PlayScreenProps = NativeStackScreenProps<MainStackParamList, 'Play'>;
export type UpgradeSheetProps = NativeStackScreenProps<MainStackParamList, 'Upgrade'>;
