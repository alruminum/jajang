/**
 * REQ-003 / REQ-004 / REQ-007 — S16SettingsScreen 다크/라이트 테마 검증
 *
 * 수용 기준:
 * - REQ-003: 다크 모드(pref='dark')에서 s16-container backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 * - REQ-004: 라이트 모드(pref='light')에서 s16-container backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 * - REQ-007: 다크/라이트 양쪽에서 radioInner (accentPrimary) 색상 검증
 *
 * 설계 근거:
 * - S16SettingsScreen 은 engineer impl 후 useTheme() + makeStyles(colors) factory 패턴 채택.
 * - SafeAreaView 는 _setup.ts 에서 ({children}) => children 으로 mock 됨.
 *   → 컨테이너 testID 는 SafeAreaView 바로 아래 View 에 박히는 "safeArea + 내부 testID View" 패턴.
 *   → task 01 cycle 1 POLISH 확정 패턴: testID="s16-container" 는 SafeAreaView 내부의 첫 번째 View.
 * - S16 는 useThemeStore (pref/setPref) + 신규 useTheme() 양 hook 공존.
 *   → themeStore mock 시 pref + setPref 모두 mock 필요 (impl §3.5).
 * - engineer impl 전: testID 없어 ElementNotFoundError → RED (TDD 사전 RED 확인).
 * - engineer impl 후: testID + useTheme factory 적용 → PASS.
 *
 * Mock 전략:
 * - useThemeStore: pref + setPref 모두 selector 패턴으로 주입 (S16 기존 useThemeStore 공존 대응)
 * - useNavigation: navigate/goBack/replace stub
 * - 외부 서비스 (revenue-cat, dataManagementApi, generationSlice, DeleteTracksSheet,
 *   dialog, toast): noop stub — 색상 검증이 목적이므로 호출 흐름 검증 X
 */

// ─── Module Mocks (import 전 선언) ───────────────────────────────────────────

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

jest.mock('@store', () => ({
  useAuthStore: jest.fn((selector: (s: {
    email: string;
    entitlement: string;
    trialExpiresAt: null;
    clearSession: jest.Mock;
  }) => unknown) =>
    selector({
      email: 'test@example.com',
      entitlement: 'free',
      trialExpiresAt: null,
      clearSession: jest.fn(),
    }),
  ),
  useThemeStore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  }),
  CommonActions: { reset: jest.fn((x: unknown) => x) },
}));

jest.mock('@services/revenue-cat', () => ({
  getManagementURL: jest.fn().mockResolvedValue('https://example.com'),
  revenueCatLogout: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@services/dataManagementApi', () => ({
  getVoiceSampleStatus: jest.fn().mockResolvedValue({ hasSample: true, sampleStatus: 'ready' }),
  deleteVoiceSample: jest.fn().mockResolvedValue(undefined),
  VoiceSampleStatus: {},
}));

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: jest.fn((selector: (s: { tracks: unknown[]; clearAllTracks: jest.Mock }) => unknown) =>
    selector({ tracks: [], clearAllTracks: jest.fn() }),
  ),
}));

jest.mock('@components/DeleteTracksSheet', () => ({
  DeleteTracksSheet: () => null,
}));

jest.mock('@utils/dialog', () => ({
  showConfirmDialog: jest.fn().mockResolvedValue(false),
}));

jest.mock('@utils/toast', () => ({
  showToast: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import S16SettingsScreen from '@screens/S16SettingsScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/**
 * pref + setPref 모두 주입 — S16 는 useThemeStore 에서 pref/setPref 양쪽 사용.
 * useTheme 내부 selector 패턴 정합 (S02/S15 task 01/02 와 동일 패턴).
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

/** S16SettingsScreen 렌더에 필요한 최소 navigation prop */
function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    setOptions: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  } as unknown as Parameters<typeof S16SettingsScreen>[0]['navigation'];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-003/REQ-004 — S16SettingsScreen 테마 배경색', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── REQ-003: 다크 모드 배경 ─────────────────────────────────────────────

  describe('REQ-003: 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('s16-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: testID="s16-container" 추가 → GREEN
      expect(getByTestId('s16-container')).toBeTruthy();
    });

    it('다크 모드에서 s16-container backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const containerStyle = flattenStyle(getByTestId('s16-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 직박 → 다크 우연 일치지만 useTheme 미채택으로 RED 기준 확인
      // engineer impl 후: colors.bgPrimary → darkColors.bgPrimary === '#0D0F1A' → PASS
      expect(containerStyle.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 s16-container backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const containerStyle = flattenStyle(getByTestId('s16-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#0D0F1A');
    });
  });

  // ─── REQ-004: 라이트 모드 배경 ───────────────────────────────────────────

  describe('REQ-004: 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 s16-container backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const containerStyle = flattenStyle(getByTestId('s16-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 고정 → lightColors.bgPrimary('#FBF7F0') 아님 → RED (핵심 RED)
      // engineer impl 후: colors.bgPrimary → lightColors.bgPrimary === '#FBF7F0' → GREEN
      expect(containerStyle.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 s16-container backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const containerStyle = flattenStyle(getByTestId('s16-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 bgPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const containerStyle = flattenStyle(getByTestId('s16-container').props.style);
      expect(containerStyle.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  // ─── 다크/라이트 교차 ────────────────────────────────────────────────────

  describe('다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 s16-container backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const darkBg = flattenStyle(getDark('s16-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const lightBg = flattenStyle(getLight('s16-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});

// ─── REQ-007: destructive 색상 (계정 탈퇴 행) 검증 ──────────────────────────

describe('REQ-007 — S16 rowLabelDestructive 색상 (accentPrimary 및 destructive 토큰 흡수)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('REQ-007: 다크 모드 (pref=dark) — radioInner accentPrimary 색 검증', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('s16-radio-inner testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      // engineer impl 후: ThemeSection 의 선택된 라디오 내부 View 에 testID="s16-radio-inner" 추가
      // engineer impl 전: ElementNotFoundError → RED
      expect(getByTestId('s16-radio-inner')).toBeTruthy();
    });

    it('다크 모드에서 s16-radio-inner backgroundColor 가 darkColors.accentPrimary 와 같다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const radioStyle = flattenStyle(getByTestId('s16-radio-inner').props.style);
      // engineer impl 전: '#5A7AA8' hex 직박 → RED (useTheme 미채택)
      // engineer impl 후: colors.accentPrimary → darkColors.accentPrimary === '#5A7AA8' → GREEN
      expect(radioStyle.backgroundColor).toBe(darkColors.accentPrimary);
    });
  });

  describe('REQ-007: 라이트 모드 (pref=light) — radioInner accentPrimary 라이트 값', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 s16-radio-inner backgroundColor 가 lightColors.accentPrimary 와 같다', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const radioStyle = flattenStyle(getByTestId('s16-radio-inner').props.style);
      // engineer impl 전: '#5A7AA8' 고정 → lightColors.accentPrimary('#3A5A88') 아님 → RED
      // engineer impl 후: colors.accentPrimary → lightColors.accentPrimary === '#3A5A88' → GREEN
      expect(radioStyle.backgroundColor).toBe(lightColors.accentPrimary);
    });

    it('라이트 모드 radioInner backgroundColor 가 다크 accentPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<S16SettingsScreen navigation={makeNavigation()} />);
      const radioStyle = flattenStyle(getByTestId('s16-radio-inner').props.style);
      expect(radioStyle.backgroundColor).not.toBe(darkColors.accentPrimary);
    });
  });
});
