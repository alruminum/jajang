import { useColorScheme } from 'react-native';
import { darkColors, lightColors, ColorTokens } from '../theme/tokens';

export function useTheme(): { colors: ColorTokens; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';   // null/undefined → dark 취급 (앱 다크 퍼스트)
  return { colors: isDark ? darkColors : lightColors, isDark };
}
