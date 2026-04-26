// ─── Colors ──────────────────────────────────────────────────────────────────
export const Colors = {
  // 배경 — 깊은 남색 (순수 black 아님)
  bgPrimary:   '#0D0F1A',
  bgDeep:      '#12152B',
  // 서피스 — 카드/시트 배경
  surface:     '#1A1D30',
  surfaceHigh: '#21253E',
  // 엑센트 — 세이지 그린 (수면·자연·평온 무드)
  accentPrimary:   '#82B090',   // Issue #87 색상 토큰 교체 반영
  accentSecondary: '#8BAED4',   // 달빛 블루 (보조 정보)
  // 경계선
  border: '#2A2E48',
  // 텍스트
  textPrimary:   '#EEF0F8',
  textSecondary: '#7B80A0',
  // 시멘틱
  destructive: '#E05252',   // 삭제·경고 (설정 탈퇴 버튼 등)
  // 파생 — 투명도 변형 (Pencil hex alpha 기준)
  accentPrimary14: '#82B09024',   // 약 14% (0x24 = 36/255)
  accentPrimary20: '#82B09033',   // 약 20% (0x33 = 51/255)
  accentPrimary33: '#82B09055',   // 약 33% (0x55 = 85/255)
} as const;

export type ColorKey = keyof typeof Colors;

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
