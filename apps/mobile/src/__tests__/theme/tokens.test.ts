/**
 * #99 dual-theme-migration — tokens.ts 테스트
 *
 * 수용 기준:
 * - darkColors / lightColors 각각 ColorTokens 키셋 전체 포함
 * - 토큰 hex 값이 디자인 확정값과 일치
 * - 파생 투명도 토큰(accentPrimary14/20/33) hex 정확도
 * - Colors 별칭이 darkColors 와 동일 참조 (하위 호환)
 *
 * [task 04 epic-12 추가]
 * REQ-001: ColorTokens 신규 9 토큰 키셋 포함 (총 24개)
 * REQ-002: darkColors 신규 9 토큰 hex = task 02/03 발견 hex 그대로 (다크 회귀 0)
 * REQ-003: lightColors 신규 9 토큰 hex = §3.1.1 architect 결정값
 * REQ-004: 기존 15 토큰 dark/light hex 변경 X (회귀 0)
 *
 * [task 08 epic-12 추가]
 * REQ-001: ColorTokens 신규 3 토큰 키셋 포함 (총 27개)
 * REQ-002: darkColors 신규 3 토큰 hex = task 05/06/본 task 발견 hex 그대로 (다크 회귀 0)
 * REQ-003: lightColors 신규 3 토큰 hex = §3.3.1 architect 결정값 (errorText = destructive 흡수)
 *
 * [task 09 epic-12 추가]
 * REQ-001: ColorTokens 신규 2 토큰 키셋 포함 (총 29개)
 * REQ-002: darkColors 신규 2 토큰 hex = task 05 §3.2.3 발견 hex 그대로 (다크 회귀 0)
 * REQ-003: lightColors 신규 2 토큰 hex = §3.3.1 architect 결정값
 * REQ-004: 기존 27 토큰 dark/light hex 변경 X (회귀 0)
 */

import { darkColors, lightColors, Colors } from '../../theme/tokens';
import type { ColorTokens } from '../../theme/tokens';

// ────────────────────────────────────────────────
// 헬퍼: ColorTokens 필수 키 목록
// ────────────────────────────────────────────────
const REQUIRED_KEYS: (keyof ColorTokens)[] = [
  // ─── 기존 15 (변경 X) ───
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
  // ─── 신규 9 (task 04 epic-12) ───
  'textHighlight',
  'textBody',
  'textBodyHigh',
  'textBodyMuted',
  'textOnAccent',
  'textMuted',
  'interactive',
  'destructiveBg',
  'toastBg',
  // ─── 신규 3 (task 08 epic-12) ───
  'successMuted',
  'errorText',
  'warning',
  // ─── 신규 2 (task 09 epic-12) ───
  'successHigh',
  'destructiveAction',
];

// ────────────────────────────────────────────────
// REQ-001 — darkColors 키셋 (29개)
// ────────────────────────────────────────────────
describe('REQ-001 — darkColors — ColorTokens 키셋 (task 09 hex-lint)', () => {
  it('ColorTokens 필수 키 29개를 모두 포함한다', () => {
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
// REQ-001 — lightColors 키셋 (29개)
// ────────────────────────────────────────────────
describe('REQ-001 — lightColors — ColorTokens 키셋 (task 09 hex-lint)', () => {
  it('ColorTokens 필수 키 29개를 모두 포함한다', () => {
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
// REQ-004 — darkColors 기존 토큰 hex 값 (회귀 0)
// ────────────────────────────────────────────────
describe('REQ-004 — darkColors — 기존 토큰 hex 값 (이슈 #99 디자인 확정값 — 변경 X)', () => {
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
// REQ-004 — darkColors 파생 투명도 토큰 (회귀 0)
// ────────────────────────────────────────────────
describe('REQ-004 — darkColors — 파생 투명도 토큰 (변경 X)', () => {
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
// REQ-002 — darkColors 신규 9 토큰 hex (task 04 missing-tokens)
// 다크 = task 02/03 발견 hex 그대로 (다크 회귀 0)
// ────────────────────────────────────────────────
describe('REQ-002 — darkColors — 신규 토큰 hex 값 (task 04 missing-tokens)', () => {
  it('textHighlight: #F5F5F5', () => {
    expect(darkColors.textHighlight).toBe('#F5F5F5');
  });

  it('textBody: #A0A5C0', () => {
    expect(darkColors.textBody).toBe('#A0A5C0');
  });

  it('textBodyHigh: #E0E2F0', () => {
    expect(darkColors.textBodyHigh).toBe('#E0E2F0');
  });

  it('textBodyMuted: #B0B4CC', () => {
    expect(darkColors.textBodyMuted).toBe('#B0B4CC');
  });

  it('textOnAccent: #FFFFFF', () => {
    expect(darkColors.textOnAccent).toBe('#FFFFFF');
  });

  it('textMuted: #4A4E68', () => {
    expect(darkColors.textMuted).toBe('#4A4E68');
  });

  it('interactive: #4A6FFF', () => {
    expect(darkColors.interactive).toBe('#4A6FFF');
  });

  it('destructiveBg: #2A1A0F', () => {
    expect(darkColors.destructiveBg).toBe('#2A1A0F');
  });

  it('toastBg: rgba(30, 34, 60, 0.95)', () => {
    expect(darkColors.toastBg).toBe('rgba(30, 34, 60, 0.95)');
  });
});

// ────────────────────────────────────────────────
// REQ-002 — darkColors 신규 3 토큰 hex (task 08 shared-components)
// 다크 = task 05/06/본 task 발견 hex 그대로 (다크 회귀 0)
// ────────────────────────────────────────────────
describe('REQ-002 — darkColors — 신규 토큰 hex 값 (task 08 shared-components)', () => {
  it('successMuted: #5A8A6A', () => {
    expect(darkColors.successMuted).toBe('#5A8A6A');
  });

  it('errorText: #FF6B6B', () => {
    expect(darkColors.errorText).toBe('#FF6B6B');
  });

  it('warning: #E0B070', () => {
    expect(darkColors.warning).toBe('#E0B070');
  });
});

// ────────────────────────────────────────────────
// REQ-002 — darkColors 신규 2 토큰 hex (task 09 hex-lint)
// 다크 = task 05 §3.2.3 발견 hex 그대로 (다크 회귀 0)
// ────────────────────────────────────────────────
describe('darkColors — 신규 토큰 hex 값 (task 09 hex-lint)', () => {
  it('successHigh: #82B090', () => {
    expect(darkColors.successHigh).toBe('#82B090');
  });

  it('destructiveAction: #FF4444', () => {
    expect(darkColors.destructiveAction).toBe('#FF4444');
  });
});

// ────────────────────────────────────────────────
// REQ-004 — lightColors 기존 토큰 hex 값 (회귀 0)
// ────────────────────────────────────────────────
describe('REQ-004 — lightColors — 기존 토큰 hex 값 (변경 X)', () => {
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
// REQ-004 — lightColors 파생 투명도 토큰 (회귀 0)
// ────────────────────────────────────────────────
describe('REQ-004 — lightColors — 파생 투명도 토큰 (변경 X)', () => {
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
// REQ-003 — lightColors 신규 9 토큰 hex (task 04 missing-tokens)
// 라이트 = architect 1차 결정값 (plan §3.1.1 근거)
// ────────────────────────────────────────────────
describe('REQ-003 — lightColors — 신규 토큰 hex 값 (task 04 missing-tokens)', () => {
  it('textHighlight: #0F0E0D (textPrimary 보다 더 짙은 헤드라인 — 강조 의도)', () => {
    expect(lightColors.textHighlight).toBe('#0F0E0D');
  });

  it('textBody: #3D352E (라이트 본문 톤다운 갈색 — 베이지 배경 위 가독성)', () => {
    expect(lightColors.textBody).toBe('#3D352E');
  });

  it('textBodyHigh: #2C2A26 (textPrimary 와 textBody 사이 — 본문 강조 톤)', () => {
    expect(lightColors.textBodyHigh).toBe('#2C2A26');
  });

  it('textBodyMuted: #5A4F45 (textSecondary 보다 옅은 — modal 부제)', () => {
    expect(lightColors.textBodyMuted).toBe('#5A4F45');
  });

  it('textOnAccent: #FFFFFF (라이트 모드에서도 accent 위 영구 흰색)', () => {
    expect(lightColors.textOnAccent).toBe('#FFFFFF');
  });

  it('textMuted: #8A8278 (textSecondary 보다 옅은 — 약관 dim / chevron / version)', () => {
    expect(lightColors.textMuted).toBe('#8A8278');
  });

  it('interactive: #3A5FE0 (라이트 베이지 배경 위 진한 파랑 — 결제 CTA 강조)', () => {
    expect(lightColors.interactive).toBe('#3A5FE0');
  });

  it('destructiveBg: #F4E8DC (라이트 위험 영역 — 옅은 베이지/주황)', () => {
    expect(lightColors.destructiveBg).toBe('#F4E8DC');
  });

  it('toastBg: rgba(220, 212, 200, 0.95) (라이트 surface 유사 + alpha 95%)', () => {
    expect(lightColors.toastBg).toBe('rgba(220, 212, 200, 0.95)');
  });
});

// ────────────────────────────────────────────────
// REQ-003 — lightColors 신규 3 토큰 hex (task 08 shared-components)
// 라이트 = architect 1차 결정값 (plan §3.3.1 근거)
// errorText = destructive 흡수 (의도적)
// ────────────────────────────────────────────────
describe('REQ-003 — lightColors — 신규 토큰 hex 값 (task 08 shared-components)', () => {
  it('successMuted: #3E6749 (라이트 beige 위 muted 녹색)', () => {
    expect(lightColors.successMuted).toBe('#3E6749');
  });

  it('errorText: #C0392B (= destructive 흡수 — 라이트에서 errorText 와 destructive 동일 시각)', () => {
    expect(lightColors.errorText).toBe('#C0392B');
  });

  it('errorText 가 lightColors.destructive 와 동일 hex 값이다 (의도적 흡수)', () => {
    expect(lightColors.errorText).toBe(lightColors.destructive);
  });

  it('warning: #A07840 (라이트 beige 위 진한 황금색 — BGM 실패 토스트)', () => {
    expect(lightColors.warning).toBe('#A07840');
  });
});

// ────────────────────────────────────────────────
// REQ-003 — lightColors 신규 2 토큰 hex (task 09 hex-lint)
// 라이트 = architect 1차 결정값 (plan §3.3.1 근거)
// ────────────────────────────────────────────────
describe('lightColors — 신규 토큰 hex 값 (task 09 hex-lint)', () => {
  it('successHigh: #5C8270', () => {
    expect(lightColors.successHigh).toBe('#5C8270');
  });

  it('destructiveAction: #D63838', () => {
    expect(lightColors.destructiveAction).toBe('#D63838');
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

  it('dark 와 light 의 successMuted 는 다른 hex 값이다', () => {
    expect(darkColors.successMuted).not.toBe(lightColors.successMuted);
  });

  it('dark 와 light 의 errorText 는 다른 hex 값이다 (다크 = 옅은 빨강 / 라이트 = destructive 흡수)', () => {
    expect(darkColors.errorText).not.toBe(lightColors.errorText);
  });

  it('dark 와 light 의 warning 는 다른 hex 값이다', () => {
    expect(darkColors.warning).not.toBe(lightColors.warning);
  });

  it('dark 와 light 의 successHigh 는 다른 hex 값이다 (task 09)', () => {
    expect(darkColors.successHigh).not.toBe(lightColors.successHigh);
  });

  it('dark 와 light 의 destructiveAction 는 다른 hex 값이다 (task 09)', () => {
    expect(darkColors.destructiveAction).not.toBe(lightColors.destructiveAction);
  });
});
