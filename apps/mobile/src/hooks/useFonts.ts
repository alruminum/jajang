import { useFonts as useExpoFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular } from '@expo-google-fonts/dm-mono';
import {
  NotoSansKR_300Light,
  NotoSansKR_400Regular,
} from '@expo-google-fonts/noto-sans-kr';

/**
 * 앱 전체 폰트 로딩 훅.
 * 반환: [loaded, error]
 * - loaded=true 또는 error!=null → SplashScreen 해제 가능
 * - 모든 폰트는 @expo-google-fonts 패키지에서 번들 로딩 (네트워크 불필요)
 *
 * 로딩하는 폰트 (tokens.ts FontFamily 상수와 1:1 대응):
 *   DMSans_400Regular    → FontFamily.dmSans
 *   DMSans_500Medium     → FontFamily.dmSansMedium
 *   DMSans_700Bold       → FontFamily.dmSansBold
 *   DMMono_400Regular    → FontFamily.dmMono
 *   NotoSansKR_300Light  → FontFamily.notoSansKRLight
 *   NotoSansKR_400Regular→ FontFamily.notoSansKR
 */
export function useFonts(): [boolean, Error | null] {
  const [loaded, error] = useExpoFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    DMMono_400Regular,
    NotoSansKR_300Light,
    NotoSansKR_400Regular,
  });
  return [loaded, error];
}
