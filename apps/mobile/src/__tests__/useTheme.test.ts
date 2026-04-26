/**
 * #99 dual-theme-migration — useTheme 훅 테스트
 *
 * 수용 기준:
 * - useColorScheme 'dark' → isDark=true, colors=darkColors
 * - useColorScheme 'light' → isDark=false, colors=lightColors
 * - useColorScheme null/undefined → isDark=true (앱 다크 퍼스트 정책)
 * - 반환 shape: { colors: ColorTokens, isDark: boolean }
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// react-native mock — useColorScheme 제어용
vi.mock('react-native', () => ({
  useColorScheme: vi.fn(),
}));

import { useColorScheme } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useTheme } from '@hooks/useTheme';
import { darkColors, lightColors } from '../theme/tokens';

const mockUseColorScheme = vi.mocked(useColorScheme);

// ────────────────────────────────────────────────
// scheme 분기 — isDark / colors 선택
// ────────────────────────────────────────────────
describe('useTheme — scheme 분기', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("useColorScheme 'dark' → isDark === true", () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
  });

  it("useColorScheme 'dark' → colors 는 darkColors 와 동일 참조", () => {
    mockUseColorScheme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors).toBe(darkColors);
  });

  it("useColorScheme 'light' → isDark === false", () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(false);
  });

  it("useColorScheme 'light' → colors 는 lightColors 와 동일 참조", () => {
    mockUseColorScheme.mockReturnValue('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors).toBe(lightColors);
  });

  it('useColorScheme null → isDark === true (다크 퍼스트 폴백)', () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = renderHook(() => useTheme());
    expect(result.current.isDark).toBe(true);
  });

  it('useColorScheme null → colors 는 darkColors 와 동일 참조', () => {
    mockUseColorScheme.mockReturnValue(null);
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors).toBe(darkColors);
  });
});

// ────────────────────────────────────────────────
// 반환값 shape 검증
// ────────────────────────────────────────────────
describe('useTheme — 반환값 shape', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('dark');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('{ colors, isDark } 두 키를 포함한 객체를 반환한다', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toHaveProperty('colors');
    expect(result.current).toHaveProperty('isDark');
  });

  it('colors 는 null 이 아닌 객체다 (ColorTokens)', () => {
    const { result } = renderHook(() => useTheme());
    expect(typeof result.current.colors).toBe('object');
    expect(result.current.colors).not.toBeNull();
  });

  it('isDark 는 boolean 이다', () => {
    const { result } = renderHook(() => useTheme());
    expect(typeof result.current.isDark).toBe('boolean');
  });

  it('dark 모드에서 colors.accentPrimary 는 darkColors 값이다', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.accentPrimary).toBe(darkColors.accentPrimary);
  });
});

// ────────────────────────────────────────────────
// light 모드 토큰 샘플 검증
// ────────────────────────────────────────────────
describe('useTheme — light 모드 토큰 샘플', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('light');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('light 모드 colors.bgPrimary 는 lightColors.bgPrimary 와 같다', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.bgPrimary).toBe(lightColors.bgPrimary);
  });

  it('light 모드 colors.textPrimary 는 lightColors.textPrimary 와 같다', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.textPrimary).toBe(lightColors.textPrimary);
  });

  it('light 모드 colors.accentPrimary 는 darkColors 값과 다르다', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.accentPrimary).not.toBe(darkColors.accentPrimary);
  });
});
