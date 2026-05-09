/**
 * REQ-005 / REQ-006 — SocialAuthButtons 다크/라이트 테마 googleBtn 배경색 검증
 *
 * 수용 기준:
 * - REQ-005: 다크 모드(pref='dark')에서 googleBtn backgroundColor === darkColors.surface ('#1A1D30')
 * - REQ-006: 라이트 모드(pref='light')에서 googleBtn backgroundColor === lightColors.surface ('#E8E0D4')
 *
 * 설계 근거:
 * - impl §3.4 매핑표: '#1A1D30' → colors.surface (다크값 '#1A1D30', 라이트값 '#E8E0D4')
 * - engineer impl 후 SocialAuthButtons 에 useTheme() + makeStyles(colors) 채택.
 * - googleBtn 에 testID="google-btn" 추가 필요 (engineer 가 추가).
 * - 현재 구현(hex '#1A1D30' 직박)으로는 REQ-006 FAIL (라이트에서도 '#1A1D30' 반환).
 *
 * Mock 전략:
 * - useThemeStore: pref 주입으로 dark/light 제어
 * - 네이티브 SDK(Apple/Google): _setup.ts 전역 mock 이용 (테스트 내 재선언 없음)
 */

// ─── Module Mocks (import 전 선언) ───────────────────────────────────────────

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    useColorScheme: jest.fn().mockReturnValue('dark'),
  };
});

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet, Platform } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import SocialAuthButtons from '@components/SocialAuthButtons';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/** pref 주입 헬퍼 — useTheme selector 패턴과 정합 (useTheme.test.ts §line 33-37 동일) */
function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation(
    (selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
      selector({ pref, setPref: jest.fn() }),
  );
}

/** StyleSheet.flatten 으로 중첩 style 배열 단일 객체로 변환 */
function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-005/REQ-006 — SocialAuthButtons 테마 googleBtn 배경색', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ─── REQ-005: 다크 모드 googleBtn 배경 ───────────────────────────────────

  describe('REQ-005: 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('google-btn testID 를 가진 요소가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      // engineer impl 전: testID 없음 → ElementNotFoundError → RED
      // engineer impl 후: testID="google-btn" 추가 → GREEN
      expect(getByTestId('google-btn')).toBeTruthy();
    });

    it('다크 모드에서 googleBtn backgroundColor 가 darkColors.surface 와 같다', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const btnStyle = flattenStyle(getByTestId('google-btn').props.style);
      // engineer impl 전: hex '#1A1D30' 직박 → 다크 값과 우연히 일치하나 useTheme 미채택 → RED
      // engineer impl 후: colors.surface → darkColors.surface === '#1A1D30' → GREEN
      expect(btnStyle.backgroundColor).toBe(darkColors.surface);
    });

    it('다크 모드에서 googleBtn backgroundColor 값이 "#1A1D30" 이다', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const btnStyle = flattenStyle(getByTestId('google-btn').props.style);
      expect(btnStyle.backgroundColor).toBe('#1A1D30');
    });
  });

  // ─── REQ-006: 라이트 모드 googleBtn 배경 ─────────────────────────────────

  describe('REQ-006: 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 googleBtn backgroundColor 가 lightColors.surface 와 같다', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const btnStyle = flattenStyle(getByTestId('google-btn').props.style);
      // engineer impl 전: hex '#1A1D30' 직박 → lightColors.surface('#E8E0D4') 아님 → RED (핵심 RED 케이스)
      // engineer impl 후: colors.surface → lightColors.surface === '#E8E0D4' → GREEN
      expect(btnStyle.backgroundColor).toBe(lightColors.surface);
    });

    it('라이트 모드에서 googleBtn backgroundColor 값이 "#E8E0D4" 이다', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const btnStyle = flattenStyle(getByTestId('google-btn').props.style);
      expect(btnStyle.backgroundColor).toBe('#E8E0D4');
    });

    it('라이트 모드 googleBtn backgroundColor 가 다크 surface hex 가 아니다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const btnStyle = flattenStyle(getByTestId('google-btn').props.style);
      expect(btnStyle.backgroundColor).not.toBe(darkColors.surface);
    });
  });

  // ─── 모드 전환 일관성 ─────────────────────────────────────────────────────

  describe('다크/라이트 교차 — googleBtn 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 googleBtn backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const darkBg = flattenStyle(getDark('google-btn').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      const lightBg = flattenStyle(getLight('google-btn').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });

  // ─── Google 버튼 기본 존재성 (accessibilityLabel 기반 — testID 없어도 확인 가능) ──

  describe('Google 버튼 기본 존재성 (testID 독립 fallback)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('Google 버튼이 accessibilityLabel 로도 조회 가능하다', () => {
      const { getByLabelText } = render(
        <SocialAuthButtons onSuccess={jest.fn()} />,
      );
      expect(getByLabelText('Google로 계속하기')).toBeTruthy();
    });
  });
});
