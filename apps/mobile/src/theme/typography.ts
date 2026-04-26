import { TextStyle, FontVariant } from 'react-native';
import { darkColors as Colors, ColorTokens, FontFamily, FontSize } from './tokens';

// 텍스트 스타일 프리셋 — 실제 TextStyle 객체
// 폰트 미로딩 시 fontFamily는 undefined로 fallback (system font 사용)
// 정적 초기화 시 darkColors 기본값 사용 (앱 다크 퍼스트 디자인)

export const Typography: Record<string, TextStyle> = {
  displayBold: {
    fontFamily: FontFamily.dmSansBold,
    fontSize:   FontSize.display,
    lineHeight: FontSize.display * 1.2,
    color:      Colors.textPrimary,
    letterSpacing: 0,
  },
  h1: {
    fontFamily: FontFamily.dmSansBold,
    fontSize:   FontSize.xxl,
    lineHeight: FontSize.xxl * 1.25,
    color:      Colors.textPrimary,
  },
  h2: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.xl,
    lineHeight: FontSize.xl * 1.3,
    color:      Colors.textPrimary,
  },
  h3: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.lg,
    lineHeight: FontSize.lg * 1.35,
    color:      Colors.textPrimary,
  },
  body: {
    fontFamily: FontFamily.notoSansKR,
    fontSize:   FontSize.md,
    lineHeight: FontSize.md * 1.6,
    color:      Colors.textPrimary,
    letterSpacing: 0.2,   // ux-flow.md: 자간 +0.2 (피로한 눈을 위한 여유)
  },
  caption: {
    fontFamily: FontFamily.notoSansKR,
    fontSize:   FontSize.sm,
    lineHeight: FontSize.sm * 1.5,
    color:      Colors.textSecondary,
    letterSpacing: 0.2,
  },
  buttonLabel: {
    fontFamily: FontFamily.dmSansMedium,
    fontSize:   FontSize.md,
    lineHeight: FontSize.md * 1.2,
    color:      Colors.bgPrimary,   // 다크 텍스트 on accentPrimary 배경
    letterSpacing: 0.3,
  },
  timerMono: {
    fontFamily: FontFamily.dmMono,
    fontSize:   FontSize.xl,
    lineHeight: FontSize.xl * 1.2,
    color:      Colors.textPrimary,
    fontVariant: ['tabular-nums'] as FontVariant[],  // ux-flow.md: Tabular numbers — 파형·타이머 숫자 흔들림 방지
  },
};

// 테마 반응 팩토리 — useTheme().colors를 주입해 동적 색상 타이포 반환
// 기존 Typography 직접 참조는 유지 (파괴적 변경 없음)
export function getTypography(colors: ColorTokens): typeof Typography {
  return {
    ...Typography,
    displayBold:  { ...Typography.displayBold,  color: colors.textPrimary },
    h1:           { ...Typography.h1,           color: colors.textPrimary },
    h2:           { ...Typography.h2,           color: colors.textPrimary },
    h3:           { ...Typography.h3,           color: colors.textPrimary },
    body:         { ...Typography.body,         color: colors.textPrimary },
    caption:      { ...Typography.caption,      color: colors.textSecondary },
    buttonLabel:  { ...Typography.buttonLabel,  color: colors.bgPrimary },
    timerMono:    { ...Typography.timerMono,    color: colors.textPrimary },
  };
}
