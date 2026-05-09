/**
 * REQ-003 / REQ-004 — S15SubscribeScreen 다크/라이트 테마 배경색 검증
 *
 * 수용 기준:
 * - REQ-003: 다크 모드(pref='dark')에서 S15 컨테이너 backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 * - REQ-004: 라이트 모드(pref='light')에서 S15 컨테이너 backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 *
 * 설계 근거:
 * - S15SubscribeScreen 은 engineer impl 후 useTheme() + makeStyles(colors) factory 패턴 채택.
 * - 컨테이너에 testID="s15-container" 추가 필요 (engineer 가 추가 — impl §9 REQ-003 통과 조건).
 * - 현재 구현(hex '#0D0F1A' 직박)으로는 REQ-004 FAIL → RED (라이트에서도 '#0D0F1A' 반환).
 *
 * Mock 전략:
 * - useThemeStore: pref 주입으로 dark/light 분기 제어
 * - SafeAreaView: _setup.ts 전역 mock ({children}) => children 이므로 내부 View 에 testID 부착 패턴 그대로 작동
 * - react-native-purchases: fetchOfferings 무한 pending 방지 목적 mock (결제 흐름 검증 대상 X)
 * - @services/revenue-cat: fetchOfferings 를 reject 처리해 로딩 상태 빠르게 종료
 * - useAuthStore: entitlement 기본값 stub
 */

// ─── Module Mocks (import 전 선언) ───────────────────────────────────────────

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('react-native-purchases', () => ({
  default: {
    getOfferings: jest.fn().mockRejectedValue(new Error('mock — test env')),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
  LOG_LEVEL: { VERBOSE: 'VERBOSE' },
}));

jest.mock('@services/revenue-cat', () => ({
  fetchOfferings: jest.fn().mockRejectedValue(new Error('mock — test env')),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  isCancelledError: jest.fn().mockReturnValue(false),
  extractEntitlement: jest.fn().mockReturnValue({ entitlement: 'free', trialExpiresAt: null }),
}));

jest.mock('@store/auth-store', () => ({
  useAuthStore: jest.fn((selector: (s: { entitlement: string; setEntitlement: jest.Mock }) => unknown) =>
    selector({ entitlement: 'free', setEntitlement: jest.fn() }),
  ),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import S15SubscribeScreen from '@screens/S15SubscribeScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/**
 * pref 주입 헬퍼 — useTheme 내부 selector 패턴과 정합.
 * S02PrivacyScreen.theme.test.tsx 동일 패턴 (task 01 확정).
 */
function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation(
    (selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
      selector({ pref, setPref: jest.fn() }),
  );
}

/**
 * StyleSheet.flatten 으로 중첩 style 배열·객체를 단일 객체로 변환.
 * (StyleSheet.flatten(undefined) → undefined 반환에 주의.)
 */
function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

/** S15SubscribeScreen 렌더에 필요한 최소 navigation prop */
function makeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
    setOptions: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(false),
  } as unknown as Parameters<typeof S15SubscribeScreen>[0]['navigation'];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-003/REQ-004 — S15SubscribeScreen 테마 배경색', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── REQ-003: 다크 모드 배경 ─────────────────────────────────────────────

  describe('REQ-003: 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('s15-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: testID="s15-container" 추가 → GREEN
      expect(getByTestId('s15-container')).toBeTruthy();
    });

    it('다크 모드에서 s15-container backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const containerStyle = flattenStyle(getByTestId('s15-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 직박 → 다크 우연 일치지만 useTheme 미채택 → RED 기준 확인
      // engineer impl 후: colors.bgPrimary → darkColors.bgPrimary === '#0D0F1A' → PASS
      expect(containerStyle.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 s15-container backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const containerStyle = flattenStyle(getByTestId('s15-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#0D0F1A');
    });
  });

  // ─── REQ-004: 라이트 모드 배경 ───────────────────────────────────────────

  describe('REQ-004: 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 s15-container backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const containerStyle = flattenStyle(getByTestId('s15-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 고정 → lightColors.bgPrimary('#FBF7F0') 아님 → RED (핵심 RED 케이스)
      // engineer impl 후: colors.bgPrimary → lightColors.bgPrimary === '#FBF7F0' → GREEN
      expect(containerStyle.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 s15-container backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const containerStyle = flattenStyle(getByTestId('s15-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 bgPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const containerStyle = flattenStyle(getByTestId('s15-container').props.style);
      expect(containerStyle.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  // ─── 다크/라이트 교차 ────────────────────────────────────────────────────

  describe('다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 s15-container backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const darkBg = flattenStyle(getDark('s15-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(<S15SubscribeScreen navigation={makeNavigation()} route={{ key: 'Subscribe', name: 'Subscribe' }} />);
      const lightBg = flattenStyle(getLight('s15-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});
