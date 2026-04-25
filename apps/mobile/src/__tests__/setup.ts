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
