/**
 * REQ-005 / REQ-006 / REQ-008 — AccountDeletionScreen 다크/라이트 테마 검증
 *
 * 수용 기준:
 * - REQ-005: 다크 모드(pref='dark')에서 account-deletion-container backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 * - REQ-006: 라이트 모드(pref='light')에서 account-deletion-container backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 * - REQ-008: confirmDeleteBtn 배경이 colors.destructive 참조 — 다크 '#E85A5A' / 라이트 '#C0392B'
 *            irreversibleText 색상도 양쪽 검증
 *
 * 설계 근거:
 * - AccountDeletionScreen 은 engineer impl 후 useTheme() + makeStyles(colors) factory 패턴 채택.
 * - SafeAreaView 는 _setup.ts 에서 ({children}) => children 으로 mock 됨.
 *   → 컨테이너 testID 는 SafeAreaView 내부의 첫 번째 View 에 부착 ("safeArea + 내부 testID View" 패턴).
 *   → testID="account-deletion-container" 는 engineer 가 추가 (현재 없음 → TDD RED).
 * - Modal 안의 confirmDeleteBtn / irreversibleText 는 isConfirmVisible=true 상태에서 노출됨.
 *   → "다음으로" 버튼 pressEvent 로 modal 열어 검증 (fireEvent.press 패턴).
 * - destructive 흡수: #FF6B6B → colors.destructive (다크 #E85A5A / 라이트 #C0392B).
 *
 * Mock 전략:
 * - useThemeStore: pref + setPref selector 패턴
 * - useNavigation: dispatch/goBack stub
 * - accountApi: deleteMyAccount noop (탈퇴 흐름 검증 X — 색상만)
 * - useAuthStore: entitlement 'free' stub (구독 배너 숨김 — 색상 검증 집중)
 * - useGenerationStore: clearAllTracks noop
 * - AudioEngine: stopPlayback noop
 * - expo-file-system/legacy: deleteAsync noop
 */

// ─── Module Mocks (import 전 선언) ───────────────────────────────────────────

jest.mock('@store/theme-store', () => ({
  useThemeStore: jest.fn(),
}));

jest.mock('@store', () => ({
  useAuthStore: jest.fn((selector: (s: {
    entitlement: string;
    clearAuthState: jest.Mock;
  }) => unknown) =>
    selector({
      entitlement: 'free',
      clearAuthState: jest.fn(),
    }),
  ),
  useThemeStore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
    dispatch: jest.fn(),
  }),
  CommonActions: { reset: jest.fn((x: unknown) => x) },
}));

jest.mock('@services/accountApi', () => ({
  deleteMyAccount: jest.fn().mockResolvedValue(undefined),
  ActiveSubscriptionError: class ActiveSubscriptionError extends Error {
    detail = { subscriptionPlatform: 'ios' as const };
  },
}));

jest.mock('@store/generationSlice', () => ({
  useGenerationStore: jest.fn((selector: (s: { tracks: unknown[]; clearAllTracks: jest.Mock }) => unknown) =>
    selector({ tracks: [], clearAllTracks: jest.fn() }),
  ),
}));

jest.mock('@audio/AudioEngine', () => ({
  stopPlayback: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/tmp/cache',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import AccountDeletionScreen from '@screens/AccountDeletionScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

/**
 * pref 주입 헬퍼 — useTheme 내부 selector 패턴과 정합.
 * S02/S15/S16 task 01/02/03 와 동일 패턴.
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

// ─── Test Suite — REQ-005/REQ-006: 컨테이너 배경색 ───────────────────────────

describe('REQ-005/REQ-006 — AccountDeletionScreen 테마 배경색', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── REQ-005: 다크 모드 배경 ─────────────────────────────────────────────

  describe('REQ-005: 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('account-deletion-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: testID="account-deletion-container" 추가 → GREEN
      expect(getByTestId('account-deletion-container')).toBeTruthy();
    });

    it('다크 모드에서 account-deletion-container backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      const containerStyle = flattenStyle(getByTestId('account-deletion-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 직박 → 다크 우연 일치지만 useTheme 미채택 → RED 기준 확인
      // engineer impl 후: colors.bgPrimary → darkColors.bgPrimary === '#0D0F1A' → GREEN
      expect(containerStyle.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 account-deletion-container backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      const containerStyle = flattenStyle(getByTestId('account-deletion-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#0D0F1A');
    });
  });

  // ─── REQ-006: 라이트 모드 배경 ───────────────────────────────────────────

  describe('REQ-006: 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 account-deletion-container backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      const containerStyle = flattenStyle(getByTestId('account-deletion-container').props.style);
      // engineer impl 전: hex '#0D0F1A' 고정 → lightColors.bgPrimary('#FBF7F0') 아님 → RED (핵심 RED)
      // engineer impl 후: colors.bgPrimary → lightColors.bgPrimary === '#FBF7F0' → GREEN
      expect(containerStyle.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 account-deletion-container backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      const containerStyle = flattenStyle(getByTestId('account-deletion-container').props.style);
      expect(containerStyle.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 bgPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<AccountDeletionScreen />);
      const containerStyle = flattenStyle(getByTestId('account-deletion-container').props.style);
      expect(containerStyle.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  // ─── 다크/라이트 교차 ────────────────────────────────────────────────────

  describe('다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 account-deletion-container backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(<AccountDeletionScreen />);
      const darkBg = flattenStyle(getDark('account-deletion-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(<AccountDeletionScreen />);
      const lightBg = flattenStyle(getLight('account-deletion-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});

// ─── REQ-008: destructive 색상 검증 (확인 모달 열어서) ───────────────────────

describe('REQ-008 — AccountDeletionScreen destructive 색상 (confirmDeleteBtn / irreversibleText)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('REQ-008: 다크 모드 (pref=dark) — destructive #E85A5A', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('confirm-delete-btn testID 를 가진 뷰가 렌더된다 — 모달 열기 후 (engineer 가 testID 추가해야 통과)', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      // "다음으로" 버튼 press → Modal visible=true → confirmDeleteBtn 노출
      fireEvent.press(getByLabelText('다음으로'));
      // engineer impl 전: testID 없어 ElementNotFoundError → RED
      // engineer impl 후: confirmDeleteBtn 에 testID="confirm-delete-btn" 추가 → GREEN
      expect(getByTestId('confirm-delete-btn')).toBeTruthy();
    });

    it('다크 모드에서 confirm-delete-btn backgroundColor 가 darkColors.destructive 와 같다', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const btnStyle = flattenStyle(getByTestId('confirm-delete-btn').props.style);
      // engineer impl 전: '#FF6B6B' 직박 → darkColors.destructive('#E85A5A') 아님 → RED
      // engineer impl 후: colors.destructive → darkColors.destructive === '#E85A5A' → GREEN
      expect(btnStyle.backgroundColor).toBe(darkColors.destructive);
    });

    it('다크 모드에서 confirm-delete-btn backgroundColor 값이 "#E85A5A" 이다', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const btnStyle = flattenStyle(getByTestId('confirm-delete-btn').props.style);
      expect(btnStyle.backgroundColor).toBe('#E85A5A');
    });

    it('다크 모드에서 "되돌릴 수 없어요" 텍스트의 color 가 darkColors.destructive 와 같다', () => {
      const { getByLabelText, getByText } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const textStyle = flattenStyle(getByText('되돌릴 수 없어요').props.style);
      // engineer impl 전: '#FF6B6B' 직박 → darkColors.destructive('#E85A5A') 아님 → RED
      // engineer impl 후: colors.destructive → darkColors.destructive === '#E85A5A' → GREEN
      expect(textStyle.color).toBe(darkColors.destructive);
    });
  });

  describe('REQ-008: 라이트 모드 (pref=light) — destructive #C0392B', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 confirm-delete-btn backgroundColor 가 lightColors.destructive 와 같다', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const btnStyle = flattenStyle(getByTestId('confirm-delete-btn').props.style);
      // engineer impl 전: '#FF6B6B' 고정 → lightColors.destructive('#C0392B') 아님 → RED (핵심 RED)
      // engineer impl 후: colors.destructive → lightColors.destructive === '#C0392B' → GREEN
      expect(btnStyle.backgroundColor).toBe(lightColors.destructive);
    });

    it('라이트 모드에서 confirm-delete-btn backgroundColor 값이 "#C0392B" 이다', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const btnStyle = flattenStyle(getByTestId('confirm-delete-btn').props.style);
      expect(btnStyle.backgroundColor).toBe('#C0392B');
    });

    it('라이트 모드에서 "되돌릴 수 없어요" 텍스트 color 가 lightColors.destructive 와 같다', () => {
      const { getByLabelText, getByText } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const textStyle = flattenStyle(getByText('되돌릴 수 없어요').props.style);
      // engineer impl 전: '#FF6B6B' 고정 → lightColors.destructive('#C0392B') 아님 → RED
      // engineer impl 후: colors.destructive → lightColors.destructive === '#C0392B' → GREEN
      expect(textStyle.color).toBe(lightColors.destructive);
    });

    it('라이트 모드 confirm-delete-btn backgroundColor 가 다크 destructive 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByLabelText, getByTestId } = render(<AccountDeletionScreen />);
      fireEvent.press(getByLabelText('다음으로'));
      const btnStyle = flattenStyle(getByTestId('confirm-delete-btn').props.style);
      expect(btnStyle.backgroundColor).not.toBe(darkColors.destructive);
    });
  });
});
