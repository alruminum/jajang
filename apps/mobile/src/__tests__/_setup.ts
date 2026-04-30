// ─── A11Y matchers (@testing-library/jest-native) ────────────────────────────
import '@testing-library/jest-native/extend-expect';

// ─── React Native globals ────────────────────────────────────────────────────
(global as unknown as Record<string, unknown>).__DEV__ = false;

// ─── react-native ────────────────────────────────────────────────────────────
// jest-expo preset이 react-native mock을 제공한다. Platform.OS=ios는 preset의
// defaultPlatform: 'ios' 설정으로 보장된다.
// AppState: 일부 테스트(AudioEngine)에서 addEventListener 호출 — jest-expo mock에 없으면 추가.
// 주의: 완전 대체 시 react-test-renderer와 React singleton 연결이 끊겨 hook 테스트가 실패함.
// Smoke 테스트의 react-native 검증은 jest-expo preset mock으로 충족 가능.

// ─── @react-native-async-storage/async-storage ───────────────────────────────
// AudioEngine → auth-store → AsyncStorage 의존성 chain을 끊기 위해 전역 mock.
// S01SplashScreen 등 각 테스트 파일에서 jest.mock으로 재정의 가능.
jest.mock('@react-native-async-storage/async-storage', () => {
  const mockStorage = {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: mockStorage };
});

// ─── react-native-safe-area-context ──────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ─── expo-secure-store ───────────────────────────────────────────────────────
// jest-expo auto-mock 미포함 → 수동 mock 유지
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// ─── Apple Authentication ─────────────────────────────────────────────────────
jest.mock('@invertase/react-native-apple-authentication', () => ({
  default: {
    performRequest: jest.fn(),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
    Error: { CANCELED: 'CANCELED' },
  },
}));

// ─── Google Sign-In ──────────────────────────────────────────────────────────
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 12501 },
}));

// ─── React Navigation ────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    replace: jest.fn(),
  })),
  useRoute: jest.fn(() => ({ params: {} })),
}));

// ─── @react-navigation/native-stack ──────────────────────────────────────────
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: jest.fn(),
}));

// ─── expo-audio ──────────────────────────────────────────────────────────────
// jest-expo auto-mock 미포함 → 수동 mock 유지.
// 각 테스트 파일에서 jest.mock('expo-audio', factory)로 override 가능.
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockReturnValue({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    volume: 1,
    currentTime: 0,
    duration: 60,
    playing: false,
  }),
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    isLoaded: true, currentTime: 0, duration: 60, didJustFinish: false,
  })),
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null,
    isRecording: false,
  })),
  useAudioRecorderState: jest.fn(() => ({
    isRecording: false, metering: undefined,
  })),
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted', canAskAgain: true, granted: true,
  }),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    status: 'granted', granted: true,
  }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));
