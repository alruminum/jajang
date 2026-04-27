/**
 * useTheme 훅 테스트
 *
 * 수용 기준:
 * - useColorScheme 'dark' → isDark=true, colors=darkColors  (pref='system')
 * - useColorScheme 'light' → isDark=false, colors=lightColors  (pref='system')
 * - useColorScheme null/undefined → isDark=true (앱 다크 퍼스트 정책)
 * - 반환 shape: { colors: ColorTokens, isDark: boolean }
 * - pref='dark' → OS scheme 무관하게 isDark=true, colors=darkColors
 * - pref='light' → OS scheme 무관하게 isDark=false, colors=lightColors
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// react-native — useColorScheme만 mock (renderHook 미사용 → react-test-renderer 충돌 없음)
vi.mock('react-native', () => ({
  useColorScheme: vi.fn(),
}));

// useThemeStore mock — AsyncStorage 의존성 차단, pref 제어용
vi.mock('../store/theme-store', () => ({
  useThemeStore: vi.fn(),
}));

import { useColorScheme } from 'react-native';
import { useThemeStore, ThemePref } from '../store/theme-store';
import { useTheme } from '@hooks/useTheme';
import { darkColors, lightColors } from '../theme/tokens';

const mockUseColorScheme = vi.mocked(useColorScheme);
const mockUseThemeStore = vi.mocked(useThemeStore);

/** pref 값을 selector 패턴으로 주입 — store action의 setPref와 구분하기 위해 mockWithPref 명칭 사용 */
function mockWithPref(pref: ThemePref) {
  mockUseThemeStore.mockImplementation((selector: (s: { pref: ThemePref; setPref: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ pref, setPref: vi.fn() })
  );
}

// ────────────────────────────────────────────────
// scheme 분기 — pref='system' (기존 동작 유지)
// ────────────────────────────────────────────────
describe('useTheme — scheme 분기 (pref=system)', () => {
  beforeEach(() => {
    mockWithPref('system');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("useColorScheme 'dark' → isDark === true", () => {
    mockUseColorScheme.mockReturnValue('dark');
    expect(useTheme().isDark).toBe(true);
  });

  it("useColorScheme 'dark' → colors 는 darkColors 와 동일 참조", () => {
    mockUseColorScheme.mockReturnValue('dark');
    expect(useTheme().colors).toBe(darkColors);
  });

  it("useColorScheme 'light' → isDark === false", () => {
    mockUseColorScheme.mockReturnValue('light');
    expect(useTheme().isDark).toBe(false);
  });

  it("useColorScheme 'light' → colors 는 lightColors 와 동일 참조", () => {
    mockUseColorScheme.mockReturnValue('light');
    expect(useTheme().colors).toBe(lightColors);
  });

  it('useColorScheme null → isDark === true (다크 퍼스트 폴백)', () => {
    mockUseColorScheme.mockReturnValue(null);
    expect(useTheme().isDark).toBe(true);
  });

  it('useColorScheme null → colors 는 darkColors 와 동일 참조', () => {
    mockUseColorScheme.mockReturnValue(null);
    expect(useTheme().colors).toBe(darkColors);
  });

  it('useColorScheme undefined → isDark === true (다크 퍼스트 폴백)', () => {
    mockUseColorScheme.mockReturnValue(undefined as unknown as null);
    expect(useTheme().isDark).toBe(true);
  });

  it('useColorScheme undefined → colors 는 darkColors 와 동일 참조', () => {
    mockUseColorScheme.mockReturnValue(undefined as unknown as null);
    expect(useTheme().colors).toBe(darkColors);
  });
});

// ────────────────────────────────────────────────
// ThemePref override
// ────────────────────────────────────────────────
describe('useTheme — ThemePref override', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("pref='dark' → isDark=true (OS scheme='light'이어도)", () => {
    mockWithPref('dark');
    mockUseColorScheme.mockReturnValue('light');
    expect(useTheme().isDark).toBe(true);
  });

  it("pref='dark' → colors === darkColors", () => {
    mockWithPref('dark');
    mockUseColorScheme.mockReturnValue('light');
    expect(useTheme().colors).toBe(darkColors);
  });

  it("pref='light' → isDark=false (OS scheme='dark'이어도)", () => {
    mockWithPref('light');
    mockUseColorScheme.mockReturnValue('dark');
    expect(useTheme().isDark).toBe(false);
  });

  it("pref='light' → colors === lightColors", () => {
    mockWithPref('light');
    mockUseColorScheme.mockReturnValue('dark');
    expect(useTheme().colors).toBe(lightColors);
  });

  it("pref='system' + scheme='dark' → isDark=true (기존 동작 유지)", () => {
    mockWithPref('system');
    mockUseColorScheme.mockReturnValue('dark');
    expect(useTheme().isDark).toBe(true);
  });

  it("pref='system' + scheme='light' → isDark=false (기존 동작 유지)", () => {
    mockWithPref('system');
    mockUseColorScheme.mockReturnValue('light');
    expect(useTheme().isDark).toBe(false);
  });
});

// ────────────────────────────────────────────────
// 반환값 shape 검증
// ────────────────────────────────────────────────
describe('useTheme — 반환값 shape', () => {
  beforeEach(() => {
    mockWithPref('system');
    mockUseColorScheme.mockReturnValue('dark');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('{ colors, isDark } 두 키를 포함한 객체를 반환한다', () => {
    const result = useTheme();
    expect(result).toHaveProperty('colors');
    expect(result).toHaveProperty('isDark');
  });

  it('colors 는 null 이 아닌 객체다 (ColorTokens)', () => {
    const result = useTheme();
    expect(typeof result.colors).toBe('object');
    expect(result.colors).not.toBeNull();
  });

  it('isDark 는 boolean 이다', () => {
    const result = useTheme();
    expect(typeof result.isDark).toBe('boolean');
  });

  it('dark 모드에서 colors.accentPrimary 는 darkColors 값이다', () => {
    const result = useTheme();
    expect(result.colors.accentPrimary).toBe(darkColors.accentPrimary);
  });
});

// ────────────────────────────────────────────────
// light 모드 토큰 샘플 검증
// ────────────────────────────────────────────────
describe('useTheme — light 모드 토큰 샘플', () => {
  beforeEach(() => {
    mockWithPref('system');
    mockUseColorScheme.mockReturnValue('light');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('light 모드 colors.bgPrimary 는 lightColors.bgPrimary 와 같다', () => {
    expect(useTheme().colors.bgPrimary).toBe(lightColors.bgPrimary);
  });

  it('light 모드 colors.textPrimary 는 lightColors.textPrimary 와 같다', () => {
    expect(useTheme().colors.textPrimary).toBe(lightColors.textPrimary);
  });

  it('light 모드 colors.accentPrimary 는 darkColors 값과 다르다', () => {
    expect(useTheme().colors.accentPrimary).not.toBe(darkColors.accentPrimary);
  });
});
