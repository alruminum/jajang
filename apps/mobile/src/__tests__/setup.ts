import { vi } from 'vitest';

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
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
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

// ─── expo-av ─────────────────────────────────────────────────────────────────
vi.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: vi.fn().mockResolvedValue({
        sound: {
          playAsync: vi.fn().mockResolvedValue(undefined),
          pauseAsync: vi.fn().mockResolvedValue(undefined),
          stopAsync: vi.fn().mockResolvedValue(undefined),
          unloadAsync: vi.fn().mockResolvedValue(undefined),
          setVolumeAsync: vi.fn().mockResolvedValue(undefined),
          setPositionAsync: vi.fn().mockResolvedValue(undefined),
          setOnPlaybackStatusUpdate: vi.fn(),
          getStatusAsync: vi.fn().mockResolvedValue({ isLoaded: true, durationMillis: 60000, positionMillis: 0 }),
        },
        status: { isLoaded: true },
      }),
    },
    setAudioModeAsync: vi.fn().mockResolvedValue(undefined),
  },
}));
