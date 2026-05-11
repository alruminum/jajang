/**
 * REQ-006 — RecordGuideScreen 다크/라이트 테마 검증
 *
 * 수용 기준 (impl plan 05 §6 — REQ-006):
 * - REQ-006(container): 다크 모드(pref='dark') → record-guide-container backgroundColor === darkColors.bgPrimary ('#0D0F1A')
 *                       라이트 모드(pref='light') → record-guide-container backgroundColor === lightColors.bgPrimary ('#FBF7F0')
 * - REQ-006(title):     다크 → record-guide-title color === darkColors.textPrimary ('#EEF0F8')
 *                       라이트 → record-guide-title color === lightColors.textPrimary ('#1C1A18')
 * - REQ-006(cta):       다크 → record-guide-cta backgroundColor === darkColors.accentPrimary ('#5A7AA8')
 *                       라이트 → record-guide-cta backgroundColor === lightColors.accentPrimary ('#3A5A88')
 *
 * 설계 근거:
 * - RecordGuideScreen 은 engineer impl 후 useTheme() + makeStyles(colors) factory (3 객체 → `{ base, chip, modal }` 단일 반환) 패턴 채택.
 * - RecordGuide L316 inline `'rgba(0,0,0,0.6)'` → factory 안 colors.overlay 흡수 (plan §3.2.2).
 * - testID 는 engineer 가 추가해야 통과하는 TDD 선언 — S06 패턴 정합.
 *
 * 현재 상태 (engineer impl 전):
 * - testID 없음 → ElementNotFoundError → RED
 * - hex '#0D0F1A' / '#EEF0F8' / '#5A7AA8' 고정 → 라이트 모드 mismatch → RED
 *
 * engineer impl 후:
 * - testID="record-guide-container" / "record-guide-title" / "record-guide-cta" 추가 + useTheme factory → GREEN
 *
 * Mock 전략 (S06 / S15 / S16 theme test 패턴 일관):
 * - useThemeStore: pref + setPref selector 패턴
 * - @react-navigation/native: useNavigation noop stub (RecordGuide 는 navigation prop 받지만 useNavigation 도 잠재 사용)
 * - AsyncStorage: noop stub (이어폰 경고 dismiss 상태)
 * - LyricsBox: noop stub
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

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@components/LyricsBox', () => ({
  __esModule: true,
  LyricsBox: () => null,
  default: () => null,
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { useThemeStore, ThemePref } from '@store/theme-store';
import { darkColors, lightColors } from '../../theme/tokens';
import RecordGuideScreen from '@screens/RecordGuideScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockUseThemeStore = jest.mocked(useThemeStore);

function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation(
    (selector: (s: { pref: ThemePref; setPref: jest.Mock }) => unknown) =>
      selector({ pref, setPref: jest.fn() }),
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return (StyleSheet.flatten(style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as Record<string, unknown>;
}

/**
 * NativeStackScreenProps mock — RecordGuide route 는 { songKey, songTitle } params 받음 (impl plan §5).
 * navigation 은 단지 navigate / goBack 정도만 호출 → jest.fn stub.
 */
function makeProps() {
  return {
    navigation: {
      navigate: jest.fn(),
      goBack: jest.fn(),
      replace: jest.fn(),
      dispatch: jest.fn(),
      setOptions: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
    } as any,
    route: {
      key: 'RecordGuide-1',
      name: 'RecordGuide',
      params: { songKey: 'lullaby_01', songTitle: '잘 자라 우리 아가' },
    } as any,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('REQ-006 — RecordGuideScreen 테마 배경색 (container)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('REQ-006 다크 모드 (pref=dark)', () => {
    beforeEach(() => {
      mockWithPref('dark');
    });

    it('record-guide-container testID 를 가진 뷰가 렌더된다 (engineer 가 testID 추가해야 통과)', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      expect(getByTestId('record-guide-container')).toBeTruthy();
    });

    it('다크 모드에서 record-guide-container backgroundColor 가 darkColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      const style = flattenStyle(getByTestId('record-guide-container').props.style);
      expect(style.backgroundColor).toBe(darkColors.bgPrimary);
    });

    it('다크 모드에서 record-guide-container backgroundColor 값이 "#0D0F1A" 이다', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      const style = flattenStyle(getByTestId('record-guide-container').props.style);
      expect(style.backgroundColor).toBe('#0D0F1A');
    });
  });

  describe('REQ-006 라이트 모드 (pref=light)', () => {
    beforeEach(() => {
      mockWithPref('light');
    });

    it('라이트 모드에서 record-guide-container backgroundColor 가 lightColors.bgPrimary 와 같다', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      const style = flattenStyle(getByTestId('record-guide-container').props.style);
      expect(style.backgroundColor).toBe(lightColors.bgPrimary);
    });

    it('라이트 모드에서 record-guide-container backgroundColor 값이 "#FBF7F0" 이다', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      const style = flattenStyle(getByTestId('record-guide-container').props.style);
      expect(style.backgroundColor).toBe('#FBF7F0');
    });

    it('라이트 모드 backgroundColor 가 다크 bgPrimary 와 다르다 (hex 고정 회귀 방지)', () => {
      const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
      const style = flattenStyle(getByTestId('record-guide-container').props.style);
      expect(style.backgroundColor).not.toBe(darkColors.bgPrimary);
    });
  });

  describe('REQ-006 다크/라이트 교차 — 배경색 반전 확인', () => {
    it('pref=dark 와 pref=light 에서 record-guide-container backgroundColor 값이 서로 다르다', () => {
      mockWithPref('dark');
      const { getByTestId: getDark } = render(<RecordGuideScreen {...makeProps()} />);
      const darkBg = flattenStyle(getDark('record-guide-container').props.style).backgroundColor;

      mockWithPref('light');
      const { getByTestId: getLight } = render(<RecordGuideScreen {...makeProps()} />);
      const lightBg = flattenStyle(getLight('record-guide-container').props.style).backgroundColor;

      expect(darkBg).not.toBe(lightBg);
    });
  });
});

// ─── REQ-006 — RecordGuideScreen title color (textPrimary) ────────────────────

describe('REQ-006 — RecordGuideScreen title color (textPrimary)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('다크 모드에서 record-guide-title color 가 darkColors.textPrimary 와 같다', () => {
    mockWithPref('dark');
    const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
    const style = flattenStyle(getByTestId('record-guide-title').props.style);
    expect(style.color).toBe(darkColors.textPrimary);
  });

  it('라이트 모드에서 record-guide-title color 가 lightColors.textPrimary 와 같다', () => {
    mockWithPref('light');
    const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
    const style = flattenStyle(getByTestId('record-guide-title').props.style);
    expect(style.color).toBe(lightColors.textPrimary);
  });
});

// ─── REQ-006 — RecordGuideScreen cta backgroundColor (accentPrimary) ──────────

describe('REQ-006 — RecordGuideScreen cta backgroundColor (accentPrimary)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('다크 모드에서 record-guide-cta backgroundColor 가 darkColors.accentPrimary 와 같다', () => {
    mockWithPref('dark');
    const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
    const style = flattenStyle(getByTestId('record-guide-cta').props.style);
    expect(style.backgroundColor).toBe(darkColors.accentPrimary);
  });

  it('라이트 모드에서 record-guide-cta backgroundColor 가 lightColors.accentPrimary 와 같다', () => {
    mockWithPref('light');
    const { getByTestId } = render(<RecordGuideScreen {...makeProps()} />);
    const style = flattenStyle(getByTestId('record-guide-cta').props.style);
    expect(style.backgroundColor).toBe(lightColors.accentPrimary);
  });
});
