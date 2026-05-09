/**
 * REQ-003 / REQ-004 — S02PrivacyScreen 다크/라이트 테마 배경색 검증
 *
 * 수용 기준:
 * - REQ-003: 다크 모드(pref='dark')에서 S02 컨테이너 backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 * - REQ-004: 라이트 모드(pref='light')에서 S02 컨테이너 backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 *
 * 설계 근거:
 * - S02PrivacyScreen 은 engineer impl 후 useTheme() 호출 + makeStyles(colors) factory 패턴 채택.
 * - 컨테이너에 testID="s02-container" 추가 필요 (engineer 가 추가 — impl §9 REQ-003 통과 조건).
 * - 현재 구현(hex 직박)으로는 FAIL, engineer impl(token 적용) 후 PASS.
 *
 * Mock 전략:
 * - useThemeStore: pref 값 주입으로 dark/light 분기 제어
 * - useColorScheme: 'dark' 고정 (pref 우선이므로 영향 없음, 노이즈 제거 목적)
 * - 네비게이션·동의 플래그 훅: SafeAreaView 렌더 오류 방지용 최소 stub
 */

// ─── Module Mocks (import 전 선언) ───────────────────────────────────────────

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@hooks/useConsentFlag', () => ({
  setConsentFlag: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import S02PrivacyScreen from '@screens/S02PrivacyScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/**
 * pref 주입 헬퍼 — useTheme 내부의 selector 패턴과 정합.
 * useTheme.test.ts §line 33-37 동일 패턴.
 */
function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation(
    (selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
      selector({ pref, setPref: jest.fn() }),
  );
}

/**
 * StyleSheet.flatten 으로 style prop 의 중첩 배열·객체를 단일 객체로 변환.
 * (StyleSheet.flatten(undefined) → undefined 반환에 주의.)
 */
function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-003/REQ-004 — S02PrivacyScreen 테마 배경색', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── REQ-003: 다크 모드 배경 ─────────────────────────────────────────────

  describe('REQ-003: 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('s02-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: testID="s02-container" 추가 → GREEN
      expect(getByTestId('s02-container')).toBeTruthy();
    });

    it('다크 모드에서 컨테이너 backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      const containerStyle = flattenStyle(getByTestId('s02-container').props.style);
      // engineer impl 전: '#0D0F1A' hex 직박 → 다크에선 우연히 같지만 useTheme 미채택으로 FAIL 기준 확인
      // engineer impl 후: colors.bgPrimary → darkColors.bgPrimary === '#0D0F1A' → PASS
      expect(containerStyle.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 컨테이너 backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      const containerStyle = flattenStyle(getByTestId('s02-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#0D0F1A');
    });
  });

  // ─── REQ-004: 라이트 모드 배경 ───────────────────────────────────────────

  describe('REQ-004: 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 컨테이너 backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      const containerStyle = flattenStyle(getByTestId('s02-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 고정 → lightColors.bgPrimary('#FBF7F0') 아님 → RED
      // engineer impl 후: colors.bgPrimary → lightColors.bgPrimary === '#FBF7F0' → GREEN
      expect(containerStyle.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 컨테이너 backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      const containerStyle = flattenStyle(getByTestId('s02-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 모드 bgPrimary 와 다르다 (다크 hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<S02PrivacyScreen />);
      const containerStyle = flattenStyle(getByTestId('s02-container').props.style);
      expect(containerStyle.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  // ─── 모드 전환 일관성 ─────────────────────────────────────────────────────

  describe('다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getByTestIdDark } = render(<S02PrivacyScreen />);
      const darkBg = flattenStyle(getByTestIdDark('s02-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getByTestIdLight } = render(<S02PrivacyScreen />);
      const lightBg = flattenStyle(getByTestIdLight('s02-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});
