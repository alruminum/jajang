// ─── Color Token Type ─────────────────────────────────────────────────────────
export type ColorTokens = {
  accentPrimary:    string;
  accentSecondary:  string;
  bgPrimary:        string;
  bgDeep:           string;
  surface:          string;
  surfaceHigh:      string;
  textPrimary:      string;
  textSecondary:    string;
  border:           string;
  destructive:      string;
  success:          string;
  overlay:          string;
  // 파생 투명도
  accentPrimary14:  string;
  accentPrimary20:  string;
  accentPrimary33:  string;
};

// ─── Dark Colors (Midnight Indigo) ───────────────────────────────────────────
export const darkColors: ColorTokens = {
  accentPrimary:    '#5A7AA8',
  accentSecondary:  '#C49A8A',
  bgPrimary:        '#0D0F1A',
  bgDeep:           '#12152B',
  surface:          '#1A1D30',
  surfaceHigh:      '#21253E',
  textPrimary:      '#EEF0F8',
  textSecondary:    '#7B80A0',
  border:           '#2A2E48',
  destructive:      '#E85A5A',
  success:          '#6BCB77',
  overlay:          '#000000AA',
  // 파생 — 투명도 변형 (Pencil hex alpha 기준)
  accentPrimary14:  '#5A7AA824',   // 약 14% (0x24 = 36/255)
  accentPrimary20:  '#5A7AA833',   // 약 20% (0x33 = 51/255)
  accentPrimary33:  '#5A7AA855',   // 약 33% (0x55 = 85/255)
};

// ─── Light Colors ─────────────────────────────────────────────────────────────
export const lightColors: ColorTokens = {
  accentPrimary:    '#3A5A88',
  accentSecondary:  '#9A6858',
  bgPrimary:        '#FBF7F0',
  bgDeep:           '#F0EAE0',
  surface:          '#E8E0D4',
  surfaceHigh:      '#DDD4C6',
  textPrimary:      '#1C1A18',
  textSecondary:    '#6B6055',
  border:           '#C8BEB0',
  destructive:      '#C0392B',
  success:          '#2E8B44',
  overlay:          '#00000066',
  // 파생 — 투명도 변형
  accentPrimary14:  '#3A5A8824',   // 약 14% (0x24 = 36/255)
  accentPrimary20:  '#3A5A8833',   // 약 20% (0x33 = 51/255)
  accentPrimary33:  '#3A5A8855',   // 약 33% (0x55 = 85/255)
};

// ─── 하위 호환 별칭 ────────────────────────────────────────────────────────────
// 기존 Colors 참조 코드 무중단 — 다크 퍼스트 앱이므로 darkColors 를 기본값으로.
export const Colors = darkColors;
export type ColorKey = keyof ColorTokens;

// ─── Font Family ──────────────────────────────────────────────────────────────
// 폰트 이름은 useFonts (impl-03) 에서 expo-font에 등록 후 유효.
// 등록 전 호출 시 system fallback. 폰트 로딩 완료 전 스플래시 유지 책임은 useFonts.
export const FontFamily = {
  // DM Sans — 제목·헤드라인·버튼 (영문/숫자)
  dmSans:       'DMSans_400Regular',
  dmSansMedium: 'DMSans_500Medium',
  dmSansBold:   'DMSans_700Bold',
  // DM Mono — 타이머·tabular numbers
  dmMono: 'DMMono_400Regular',
  // Noto Sans KR — 한글 본문
  notoSansKRLight: 'NotoSansKR_300Light',   // Light (300)
  notoSansKR:      'NotoSansKR_400Regular', // Regular = base (400)
} as const;

export type FontFamilyKey = keyof typeof FontFamily;

// ─── Font Size (7단계) ────────────────────────────────────────────────────────
export const FontSize = {
  xs:      12,
  sm:      14,
  md:      16,
  lg:      18,
  xl:      22,
  xxl:     28,
  display: 36,
} as const;

export type FontSizeKey = keyof typeof FontSize;

// ─── Border Radius (4단계) ───────────────────────────────────────────────────
export const Radius = {
  sm:   4,
  md:   8,
  lg:   16,   // 카드 r-16 (ux-flow.md UI 패턴)
  pill: 28,   // 버튼 Primary r-28 (pill 형태)
} as const;

export type RadiusKey = keyof typeof Radius;
