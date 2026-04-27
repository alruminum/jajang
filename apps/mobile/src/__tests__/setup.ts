import { vi } from 'vitest';

// ─── React Native globals ────────────────────────────────────────────────────
// __DEV__ is a React Native global (true in development). Define it here so
// modules like revenue-cat.ts that reference __DEV__ at import time don't throw.
(global as unknown as Record<string, unknown>).__DEV__ = false;

// ─── react-native ────────────────────────────────────────────────────────────
vi.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (obj: Record<string, unknown>) => obj['ios'] ?? obj['default'],
  },
  Alert: { alert: vi.fn() },
  StyleSheet: {
    create: (s: Record<string, unknown>) => s,
    flatten: (s: unknown) => s,
    hairlineWidth: 1,
    absoluteFill: {},
  },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ActivityIndicator: 'ActivityIndicator',
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Linking: {
    openURL: vi.fn().mockResolvedValue(undefined),
    openSettings: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── react-native-safe-area-context ──────────────────────────────────────────
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ─── expo-secure-store ───────────────────────────────────────────────────────
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

// ─── Apple Authentication ─────────────────────────────────────────────────────
vi.mock('@invertase/react-native-apple-authentication', () => ({
  default: {
    performRequest: vi.fn(),
    Operation: { LOGIN: 'LOGIN' },
    Scope: { EMAIL: 'EMAIL', FULL_NAME: 'FULL_NAME' },
    Error: { CANCELED: 'CANCELED' },
  },
}));

// ─── Google Sign-In ──────────────────────────────────────────────────────────
vi.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: vi.fn(),
    hasPlayServices: vi.fn().mockResolvedValue(true),
    signIn: vi.fn(),
  },
  statusCodes: { SIGN_IN_CANCELLED: 12501 },
}));

// ─── React Navigation ────────────────────────────────────────────────────────
vi.mock('@react-navigation/native', () => ({
  useNavigation: vi.fn(() => ({
    navigate: vi.fn(),
    replace: vi.fn(),
  })),
  useRoute: vi.fn(() => ({ params: {} })),
}));

// ─── @react-navigation/native-stack ──────────────────────────────────────────
vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: vi.fn(),
}));

// ─── react-native-track-player ───────────────────────────────────────────────
// AudioEngine이 import하므로 NativeModules 의존성 차단
vi.mock('react-native-track-player', () => ({
  default: {
    setupPlayer: vi.fn().mockResolvedValue(undefined),
    updateOptions: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    seekTo: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue('none'),
    getPosition: vi.fn().mockResolvedValue(0),
    getDuration: vi.fn().mockResolvedValue(0),
    getCurrentTrack: vi.fn().mockResolvedValue(null),
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    removeUpcomingTracks: vi.fn().mockResolvedValue(undefined),
    updateMetadataForTrack: vi.fn().mockResolvedValue(undefined),
  },
  Capability: {
    Play: 'play',
    Pause: 'pause',
    Stop: 'stop',
    SeekTo: 'seekTo',
    JumpForward: 'jump-forward',
    JumpBackward: 'jump-backward',
  },
  Event: {
    PlaybackState: 'playback-state',
    PlaybackError: 'playback-error',
    PlaybackQueueEnded: 'playback-queue-ended',
    RemotePlay: 'remote-play',
    RemotePause: 'remote-pause',
    RemoteStop: 'remote-stop',
    RemoteNext: 'remote-next',
    RemotePrevious: 'remote-previous',
  },
  State: {
    None: 'none',
    Ready: 'ready',
    Playing: 'playing',
    Paused: 'paused',
    Stopped: 'stopped',
    Buffering: 'buffering',
    Error: 'error',
  },
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
}));

// ─── expo-audio ──────────────────────────────────────────────────────────────
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
    get volume() { return 1; },
    set volume(_v: number) {},
    get currentTime() { return 0; },
    get duration() { return 60; },
    get playing() { return false; },
  })),
  useAudioPlayer: vi.fn(() => ({
    play: vi.fn(),
    pause: vi.fn(),
    remove: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
  })),
  useAudioPlayerStatus: vi.fn(() => ({
    isLoaded: true,
    currentTime: 0,
    duration: 60,
    didJustFinish: false,
  })),
  useAudioRecorder: vi.fn(() => ({
    prepareToRecordAsync: vi.fn().mockResolvedValue(undefined),
    record: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    uri: null,
    isRecording: false,
  })),
  useAudioRecorderState: vi.fn(() => ({
    isRecording: false,
    metering: undefined,
  })),
  getRecordingPermissionsAsync: vi.fn().mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
  }),
  requestRecordingPermissionsAsync: vi.fn().mockResolvedValue({
    status: 'granted',
    granted: true,
  }),
  setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
}));
