/**
 * REQ-005 — S06HomeScreen 다크/라이트 테마 검증
 *
 * 수용 기준:
 * - REQ-005(다크): 다크 모드(pref='dark') 에서 s06-container backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 * - REQ-005(라이트): 라이트 모드(pref='light') 에서 s06-container backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 * - REQ-005(fab): 다크 모드에서 s06-fab backgroundColor === darkColors.accentPrimary ('#5A7AA8')
 *                 라이트 모드에서 s06-fab backgroundColor === lightColors.accentPrimary ('#3A5A88')
 * - REQ-005(headerTitle): 다크 모드에서 s06-header-title color === darkColors.textPrimary ('#EEF0F8')
 *                          라이트 모드에서 s06-header-title color === lightColors.textPrimary ('#1C1A18')
 *
 * 설계 근거:
 * - S06HomeScreen 은 engineer impl 후 useTheme() + makeStyles(colors) factory 패턴 채택.
 * - S06HomeScreen 은 useNavigation() 훅으로 navigation 주입 (Props 직접 전달 X).
 *   → @react-navigation/native 의 useNavigation mock 으로 대응.
 * - SafeAreaView: _setup.ts 전역 mock ({children}) => children 으로 패스스루.
 * - testID 는 engineer 가 추가해야 통과하는 TDD 선언.
 *
 * 현재 상태 (engineer impl 전):
 * - testID 없음 → ElementNotFoundError → RED (핵심 RED)
 * - hex '#0D0F1A' 고정 → 라이트 모드 backgroundColor ≠ lightColors.bgPrimary → RED
 *
 * engineer impl 후:
 * - testID="s06-container" 추가 + useTheme factory → GREEN
 *
 * Mock 전략 (S16/S15 theme test 동일 패턴 — task 01~03 확정):
 * - useThemeStore: pref + setPref selector 패턴으로 다크/라이트 분기 제어
 * - useNavigation: navigate/replace/goBack/dispatch stub (S06 은 useFocusEffect + useNavigation 사용)
 * - useFocusEffect: useEffect 로 대체 (cleanup 즉시 실행)
 * - 외부 store (useAuthStore / usePlayerStore / useMastersStore / useTrialExpiredGuard): noop stub
 * - 외부 API (getSessionStatus / loadPendingSession / clearPendingSession): noop stub
 * - 외부 컴포넌트 (TrialBadge / TrialExpiryBanner / MiniPlayer / MasterAudioCard /
 *   EmptyMastersState / JustArrivedMasterCard): () => null stub
 */

// ─── Module Mocks (import 전 선언 — jest hoisting 필수) ──────────────────────

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
    dispatch: jest.fn(),
    setOptions: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  }),
  useFocusEffect: (cb: () => (() => void) | void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return cleanup ?? undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
  CommonActions: { reset: jest.fn((x: unknown) => x) },
}));

jest.mock('@store/auth-store', () => ({
  useAuthStore: jest.fn(() => ({
    entitlement: 'free',
    trialExpiresAt: null,
    clearSession: jest.fn(),
  })),
}));

jest.mock('@store/player-store', () => ({
  usePlayerStore: jest.fn(() => ({
    currentTrackId: null,
  })),
}));

jest.mock('@store/mastersSlice', () => ({
  useMastersStore: jest.fn(() => ({
    items: [],
    hasPending: false,
    nextCursor: null,
    isLoading: false,
    loadMasters: jest.fn(),
    loadMore: jest.fn(),
  })),
}));

jest.mock('@hooks/useTrialExpiredGuard', () => ({
  useTrialExpiredGuard: jest.fn(),
}));

jest.mock('@services/storage/pendingSession', () => ({
  loadPendingSession: jest.fn().mockResolvedValue(null),
  clearPendingSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@services/api/sessions', () => ({
  getSessionStatus: jest.fn().mockResolvedValue({ status: 'none' }),
}));

// 외부 컴포넌트 noop stub
jest.mock('@components/TrialBadge', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@components/TrialExpiryBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@components/MiniPlayer', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@components/MasterAudioCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@components/EmptyMastersState', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@components/JustArrivedMasterCard', () => ({
  __esModule: true,
  default: () => null,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import S06HomeScreen from '@screens/S06HomeScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/**
 * pref + setPref 모두 주입 — useTheme 내부 selector 패턴 정합.
 * S15/S16 theme test 확정 패턴 (task 01~03 일관).
 */
function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation(
    (selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
      selector({ pref, setPref: jest.fn() }),
  );
}

/** StyleSheet.flatten 으로 중첩 style 배열·객체를 단일 객체로 변환. */
function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-005 — S06HomeScreen 테마 배경색 (container)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── 다크 모드 ────────────────────────────────────────────────────────────

  describe('REQ-005 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('s06-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: testID="s06-container" 추가 → GREEN
      expect(getByTestId('s06-container')).toBeTruthy();
    });

    it('다크 모드에서 s06-container backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      const style = flattenStyle(getByTestId('s06-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 직박 → 다크 우연 일치이나 useTheme 미채택으로 테스트 목적 위반
      // engineer impl 후: colors.bgPrimary → darkColors.bgPrimary === '#0D0F1A' → GREEN
      expect(style.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 s06-container backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      const style = flattenStyle(getByTestId('s06-container').props.style);
      expect(style.backgroundColor).toBe('#0D0F1A');
    });
  });

  // ─── 라이트 모드 ──────────────────────────────────────────────────────────

  describe('REQ-005 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 s06-container backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      const style = flattenStyle(getByTestId('s06-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 고정 → lightColors.bgPrimary('#FBF7F0') 아님 → RED (핵심 RED)
      // engineer impl 후: colors.bgPrimary → lightColors.bgPrimary === '#FBF7F0' → GREEN
      expect(style.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 s06-container backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      const style = flattenStyle(getByTestId('s06-container').props.style);
      expect(style.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 bgPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<S06HomeScreen />);
      const style = flattenStyle(getByTestId('s06-container').props.style);
      expect(style.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  // ─── 다크/라이트 교차 ──────────────────────────────────────────────────────

  describe('REQ-005 다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 s06-container backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(<S06HomeScreen />);
      const darkBg = flattenStyle(getDark('s06-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(<S06HomeScreen />);
      const lightBg = flattenStyle(getLight('s06-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});

// ─── REQ-005 — S06HomeScreen fab backgroundColor ─────────────────────────────

describe('REQ-005 — S06HomeScreen fab backgroundColor (accentPrimary)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('다크 모드에서 s06-fab backgroundColor 가 darkColors.accentPrimary 와 같다', () => {
    mockWithPref('dark');
    const { getByTestId } = render(<S06HomeScreen />);
    // engineer impl 전: '#5A7AA8' 직박 → RED
    // engineer impl 후: colors.accentPrimary → darkColors.accentPrimary === '#5A7AA8' → GREEN
    const style = flattenStyle(getByTestId('s06-fab').props.style);
    expect(style.backgroundColor).toBe(darkColors.accentPrimary);
  });

  it('라이트 모드에서 s06-fab backgroundColor 가 lightColors.accentPrimary 와 같다', () => {
    mockWithPref('light');
    const { getByTestId } = render(<S06HomeScreen />);
    // engineer impl 전: '#5A7AA8' 고정 → lightColors.accentPrimary('#3A5A88') 아님 → RED (핵심 RED)
    // engineer impl 후: colors.accentPrimary → lightColors.accentPrimary === '#3A5A88' → GREEN
    const style = flattenStyle(getByTestId('s06-fab').props.style);
    expect(style.backgroundColor).toBe(lightColors.accentPrimary);
  });
});

// ─── REQ-005 — S06HomeScreen headerTitle color ────────────────────────────────

describe('REQ-005 — S06HomeScreen headerTitle color (textPrimary)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('다크 모드에서 s06-header-title color 가 darkColors.textPrimary 와 같다', () => {
    mockWithPref('dark');
    const { getByTestId } = render(<S06HomeScreen />);
    // engineer impl 전: '#EEF0F8' 직박 → RED
    // engineer impl 후: colors.textPrimary → darkColors.textPrimary === '#EEF0F8' → GREEN
    const style = flattenStyle(getByTestId('s06-header-title').props.style);
    expect(style.color).toBe(darkColors.textPrimary);
  });

  it('라이트 모드에서 s06-header-title color 가 lightColors.textPrimary 와 같다', () => {
    mockWithPref('light');
    const { getByTestId } = render(<S06HomeScreen />);
    // engineer impl 전: '#EEF0F8' 고정 → lightColors.textPrimary('#1C1A18') 아님 → RED (핵심 RED)
    // engineer impl 후: colors.textPrimary → lightColors.textPrimary === '#1C1A18' → GREEN
    const style = flattenStyle(getByTestId('s06-header-title').props.style);
    expect(style.color).toBe(lightColors.textPrimary);
  });
});
