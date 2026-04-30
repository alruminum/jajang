/**
 * #99 dual-theme-migration — typography.ts 테스트
 *
 * 수용 기준:
 * - Typography 정적 객체의 기존 키 유지 (파괴적 변경 없음)
 * - getTypography(colors) 팩토리가 textPrimary/textSecondary/bgPrimary 를 colors 로 override
 * - 기존 fontFamily, fontSize 등 non-color 속성은 변경되지 않는다
 */

import { getTypography, Typography } from '../../theme/typography';
import { darkColors, lightColors } from '../../theme/tokens';

const REQUIRED_KEYS = [
  'displayBold',
  'h1',
  'h2',
  'h3',
  'body',
  'caption',
  'buttonLabel',
  'timerMono',
] as const;

// ────────────────────────────────────────────────
// Typography 정적 객체 — 기존 키 유지 검증
// ────────────────────────────────────────────────
describe('Typography 정적 객체 — 키 존재 검증', () => {

  it('필수 타이포그래피 키 8개를 모두 포함한다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(Typography).toHaveProperty(key);
    }
  });

  it('각 키는 객체(TextStyle)다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(typeof Typography[key]).toBe('object');
      expect(Typography[key]).not.toBeNull();
    }
  });
});

// ────────────────────────────────────────────────
// getTypography(darkColors) — color override 검증
// ────────────────────────────────────────────────
describe('getTypography(darkColors) — color override', () => {
  const typo = getTypography(darkColors);

  it('displayBold.color 는 darkColors.textPrimary 다', () => {
    expect(typo.displayBold.color).toBe(darkColors.textPrimary);
  });

  it('h1.color 는 darkColors.textPrimary 다', () => {
    expect(typo.h1.color).toBe(darkColors.textPrimary);
  });

  it('h2.color 는 darkColors.textPrimary 다', () => {
    expect(typo.h2.color).toBe(darkColors.textPrimary);
  });

  it('h3.color 는 darkColors.textPrimary 다', () => {
    expect(typo.h3.color).toBe(darkColors.textPrimary);
  });

  it('body.color 는 darkColors.textPrimary 다', () => {
    expect(typo.body.color).toBe(darkColors.textPrimary);
  });

  it('caption.color 는 darkColors.textSecondary 다', () => {
    expect(typo.caption.color).toBe(darkColors.textSecondary);
  });

  it('buttonLabel.color 는 darkColors.bgPrimary 다', () => {
    expect(typo.buttonLabel.color).toBe(darkColors.bgPrimary);
  });

  it('timerMono.color 는 darkColors.textPrimary 다', () => {
    expect(typo.timerMono.color).toBe(darkColors.textPrimary);
  });
});

// ────────────────────────────────────────────────
// getTypography(lightColors) — light 테마 override
// ────────────────────────────────────────────────
describe('getTypography(lightColors) — color override', () => {
  const typo = getTypography(lightColors);

  it('h1.color 는 lightColors.textPrimary 다', () => {
    expect(typo.h1.color).toBe(lightColors.textPrimary);
  });

  it('caption.color 는 lightColors.textSecondary 다', () => {
    expect(typo.caption.color).toBe(lightColors.textSecondary);
  });

  it('buttonLabel.color 는 lightColors.bgPrimary 다', () => {
    expect(typo.buttonLabel.color).toBe(lightColors.bgPrimary);
  });

  it('h1.color 가 darkColors 결과와 다르다 (테마 분리 보장)', () => {
    const darkTypo = getTypography(darkColors);
    expect(typo.h1.color).not.toBe(darkTypo.h1.color);
  });
});

// ────────────────────────────────────────────────
// getTypography — non-color 속성 불변 검증
// (파괴적 변경 없음: fontFamily, fontSize 등 유지)
// ────────────────────────────────────────────────
describe('getTypography — non-color 속성 불변', () => {
  it('getTypography(darkColors).h1 에는 Typography.h1 의 속성이 모두 포함된다', () => {
    const typo = getTypography(darkColors);
    // color 외 모든 속성이 원본에서 spread 된다
    for (const [key, value] of Object.entries(Typography.h1)) {
      if (key === 'color') continue; // color 는 override 대상
      expect((typo.h1 as Record<string, unknown>)[key]).toEqual(value);
    }
  });

  it('getTypography(lightColors).caption 에는 Typography.caption 의 non-color 속성이 유지된다', () => {
    const typo = getTypography(lightColors);
    for (const [key, value] of Object.entries(Typography.caption)) {
      if (key === 'color') continue;
      expect((typo.caption as Record<string, unknown>)[key]).toEqual(value);
    }
  });
});

// ────────────────────────────────────────────────
// Typography 정적 객체 불변 — getTypography 가 원본을 변경하지 않는다
// ────────────────────────────────────────────────
describe('Typography 원본 불변성', () => {
  it('getTypography 호출 후 Typography.h1 참조가 변경되지 않는다', () => {
    const originalH1 = Typography.h1;
    getTypography(lightColors);
    expect(Typography.h1).toBe(originalH1);
  });

  it('getTypography 는 호출마다 새 객체를 반환한다 (원본 참조 아님)', () => {
    const typo1 = getTypography(darkColors);
    const typo2 = getTypography(darkColors);
    expect(typo1).not.toBe(typo2);
  });
});
