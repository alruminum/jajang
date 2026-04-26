// 스페이싱 (6단계) — 4의 배수 기반
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export type SpacingKey = keyof typeof Spacing;
