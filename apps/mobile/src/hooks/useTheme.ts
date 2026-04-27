import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';
import { useThemeStore } from '../store/theme-store';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const pref = useThemeStore((s) => s.pref);
  const scheme = useColorScheme();

  let isDark: boolean;
  if (pref === 'dark') {
    isDark = true;
  } else if (pref === 'light') {
    isDark = false;
  } else {
    // pref === 'system' → OS 추종 (기존 로직 유지)
    isDark = scheme !== 'light';  // null/undefined → dark 취급 (다크 퍼스트 정책)
  }

  return { colors: isDark ? darkColors : lightColors, isDark };
}
