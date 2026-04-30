/**
 * #99 dual-theme-migration — tokens.ts 테스트
 *
 * 수용 기준:
 * - darkColors / lightColors 각각 ColorTokens 키셋 전체 포함
 * - 토큰 hex 값이 디자인 확정값과 일치
 * - 파생 투명도 토큰(accentPrimary14/20/33) hex 정확도
 * - Colors 별칭이 darkColors 와 동일 참조 (하위 호환)
 */

import { darkColors, lightColors, Colors } from '../../theme/tokens';
import type { ColorTokens } from '../../theme/tokens';

// ────────────────────────────────────────────────
// 헬퍼: ColorTokens 필수 키 목록
// ────────────────────────────────────────────────
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  'accentPrimary',
  'accentSecondary',
  'bgPrimary',
  'bgDeep',
  'surface',
  'surfaceHigh',
  'textPrimary',
  'textSecondary',
  'border',
  'destructive',
  'success',
  'overlay',
  'accentPrimary14',
  'accentPrimary20',
  'accentPrimary33',
];

// ────────────────────────────────────────────────
// darkColors 키셋
// ────────────────────────────────────────────────
describe('darkColors — ColorTokens 키셋', () => {
  it('ColorTokens 필수 키 15개를 모두 포함한다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(darkColors).toHaveProperty(key);
    }
  });

  it('모든 값이 비어있지 않은 string 이다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(typeof darkColors[key]).toBe('string');
      expect(darkColors[key].length).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────────────────────────
// darkColors 토큰 hex 값 (이슈 #99 디자인 확정값)
// ────────────────────────────────────────────────
describe('darkColors — 토큰 hex 값', () => {
  it('accentPrimary: #5A7AA8 (Midnight Indigo dark)', () => {
    expect(darkColors.accentPrimary).toBe('#5A7AA8');
  });

  it('accentSecondary: #C49A8A', () => {
    expect(darkColors.accentSecondary).toBe('#C49A8A');
  });

  it('bgPrimary: #0D0F1A', () => {
    expect(darkColors.bgPrimary).toBe('#0D0F1A');
  });

  it('bgDeep: #12152B', () => {
    expect(darkColors.bgDeep).toBe('#12152B');
  });

  it('surface: #1A1D30', () => {
    expect(darkColors.surface).toBe('#1A1D30');
  });

  it('surfaceHigh: #21253E', () => {
    expect(darkColors.surfaceHigh).toBe('#21253E');
  });

  it('textPrimary: #EEF0F8', () => {
    expect(darkColors.textPrimary).toBe('#EEF0F8');
  });

  it('textSecondary: #7B80A0', () => {
    expect(darkColors.textSecondary).toBe('#7B80A0');
  });

  it('border: #2A2E48', () => {
    expect(darkColors.border).toBe('#2A2E48');
  });

  it('destructive: #E85A5A (기존 #E05252 에서 디자인 확정값으로 변경)', () => {
    expect(darkColors.destructive).toBe('#E85A5A');
  });

  it('success: #6BCB77 (신규 토큰)', () => {
    expect(darkColors.success).toBe('#6BCB77');
  });

  it('overlay: #000000AA (신규 토큰)', () => {
    expect(darkColors.overlay).toBe('#000000AA');
  });
});

// ────────────────────────────────────────────────
// darkColors 파생 투명도 토큰
// ────────────────────────────────────────────────
describe('darkColors — 파생 투명도 토큰', () => {
  it('accentPrimary14: #5A7AA824 (alpha ≈ 14%)', () => {
    expect(darkColors.accentPrimary14).toBe('#5A7AA824');
  });

  it('accentPrimary20: #5A7AA833 (alpha ≈ 20%)', () => {
    expect(darkColors.accentPrimary20).toBe('#5A7AA833');
  });

  it('accentPrimary33: #5A7AA855 (alpha ≈ 33%)', () => {
    expect(darkColors.accentPrimary33).toBe('#5A7AA855');
  });
});

// ────────────────────────────────────────────────
// lightColors 키셋
// ────────────────────────────────────────────────
describe('lightColors — ColorTokens 키셋', () => {
  it('ColorTokens 필수 키 15개를 모두 포함한다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(lightColors).toHaveProperty(key);
    }
  });

  it('모든 값이 비어있지 않은 string 이다', () => {
    for (const key of REQUIRED_KEYS) {
      expect(typeof lightColors[key]).toBe('string');
      expect(lightColors[key].length).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────────────────────────
// lightColors 토큰 hex 값
// ────────────────────────────────────────────────
describe('lightColors — 토큰 hex 값', () => {
  it('accentPrimary: #3A5A88 (Midnight Indigo light)', () => {
    expect(lightColors.accentPrimary).toBe('#3A5A88');
  });

  it('accentSecondary: #9A6858', () => {
    expect(lightColors.accentSecondary).toBe('#9A6858');
  });

  it('bgPrimary: #FBF7F0', () => {
    expect(lightColors.bgPrimary).toBe('#FBF7F0');
  });

  it('bgDeep: #F0EAE0', () => {
    expect(lightColors.bgDeep).toBe('#F0EAE0');
  });

  it('surface: #E8E0D4', () => {
    expect(lightColors.surface).toBe('#E8E0D4');
  });

  it('surfaceHigh: #DDD4C6', () => {
    expect(lightColors.surfaceHigh).toBe('#DDD4C6');
  });

  it('textPrimary: #1C1A18', () => {
    expect(lightColors.textPrimary).toBe('#1C1A18');
  });

  it('textSecondary: #6B6055', () => {
    expect(lightColors.textSecondary).toBe('#6B6055');
  });

  it('border: #C8BEB0', () => {
    expect(lightColors.border).toBe('#C8BEB0');
  });

  it('destructive: #C0392B', () => {
    expect(lightColors.destructive).toBe('#C0392B');
  });

  it('success: #2E8B44 (신규 토큰)', () => {
    expect(lightColors.success).toBe('#2E8B44');
  });

  it('overlay: #00000066 (신규 토큰)', () => {
    expect(lightColors.overlay).toBe('#00000066');
  });
});

// ────────────────────────────────────────────────
// lightColors 파생 투명도 토큰
// ────────────────────────────────────────────────
describe('lightColors — 파생 투명도 토큰', () => {
  it('accentPrimary14: #3A5A8824 (alpha ≈ 14%)', () => {
    expect(lightColors.accentPrimary14).toBe('#3A5A8824');
  });

  it('accentPrimary20: #3A5A8833 (alpha ≈ 20%)', () => {
    expect(lightColors.accentPrimary20).toBe('#3A5A8833');
  });

  it('accentPrimary33: #3A5A8855 (alpha ≈ 33%)', () => {
    expect(lightColors.accentPrimary33).toBe('#3A5A8855');
  });
});

// ────────────────────────────────────────────────
// 하위 호환 별칭 + dark/light 분리 보장
// ────────────────────────────────────────────────
describe('Colors 하위 호환 별칭', () => {
  it('Colors 는 darkColors 와 동일한 참조다', () => {
    expect(Colors).toBe(darkColors);
  });

  it('darkColors 와 lightColors 는 서로 다른 객체다', () => {
    expect(darkColors).not.toBe(lightColors);
  });

  it('dark 와 light 의 accentPrimary 는 다른 hex 값이다', () => {
    expect(darkColors.accentPrimary).not.toBe(lightColors.accentPrimary);
  });

  it('dark 와 light 의 textPrimary 는 다른 hex 값이다 (명암 반전)', () => {
    expect(darkColors.textPrimary).not.toBe(lightColors.textPrimary);
  });
});
