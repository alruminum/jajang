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
  // ─── 신규 9 (task 04 epic-12) ───
  textHighlight:    string;  // 헤드라인·toastText·고대비 텍스트
  textBody:         string;  // 결제 본문
  textBodyHigh:     string;  // S16/AccDel 본문 강조
  textBodyMuted:    string;  // AccDel modalSubtitle
  textOnAccent:     string;  // accent 위 영구 화이트 텍스트
  textMuted:        string;  // 약관 dim / chevron / version
  interactive:      string;  // 결제 CTA / Premium 배지 / 강조 링크
  destructiveBg:    string;  // 위험 영역 배경
  toastBg:          string;  // toast bg (rgba 포함 가능)
  // ─── 신규 3 (task 08 epic-12) ───
  successMuted:     string;  // 삭제 버튼 / silenceWarning / exhaustedText
  errorText:        string;  // 에러 메시지 / 삭제 액션 텍스트
  warning:          string;  // BGM 실패 토스트
  // ─── 신규 2 (task 09 epic-12) ───
  successHigh:      string;  // HeadphoneChip border + text (RecordGuide)
  destructiveAction: string; // stopRing border + stopBtn bg (RecordScreen)
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
  // ─── 신규 9 (task 04 epic-12) — 다크 = task 02/03 발견 hex 그대로 (회귀 0) ───
  textHighlight:    '#F5F5F5',
  textBody:         '#A0A5C0',
  textBodyHigh:     '#E0E2F0',
  textBodyMuted:    '#B0B4CC',
  textOnAccent:     '#FFFFFF',
  textMuted:        '#4A4E68',
  interactive:      '#4A6FFF',
  destructiveBg:    '#2A1A0F',
  toastBg:          'rgba(30, 34, 60, 0.95)',
  // ─── 신규 3 (task 08 epic-12) — 다크 = task 05/06/본 task 발견 hex 그대로 (회귀 0) ───
  successMuted:    '#5A8A6A',
  errorText:       '#FF6B6B',
  warning:         '#E0B070',
  // ─── 신규 2 (task 09 epic-12) — 다크 = task 05 §3.2.3 발견 hex 그대로 (회귀 0) ───
  successHigh:     '#82B090',
  destructiveAction: '#FF4444',
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
  // ─── 신규 9 (task 04 epic-12) — 라이트 = architect 1차 결정값 (plan §3.1.1) ───
  textHighlight:    '#0F0E0D',
  textBody:         '#3D352E',
  textBodyHigh:     '#2C2A26',
  textBodyMuted:    '#5A4F45',
  textOnAccent:     '#FFFFFF',
  textMuted:        '#8A8278',
  interactive:      '#3A5FE0',
  destructiveBg:    '#F4E8DC',
  toastBg:          'rgba(220, 212, 200, 0.95)',
  // ─── 신규 3 (task 08 epic-12) — 라이트 = architect 1차 결정값 (plan §3.3.1) ───
  successMuted:    '#3E6749',
  errorText:       '#C0392B',   // = lightColors.destructive (의도적 흡수)
  warning:         '#A07840',
  // ─── 신규 2 (task 09 epic-12) — 라이트 = §3.3.1 architect 결정값 ───
  successHigh:     '#5C8270',
  destructiveAction: '#D63838',
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
