/**
 * task 05 m1a-core-flow-screens — REQ-001 / REQ-002 / REQ-003 / REQ-004 / REQ-012
 *
 * 4 대상 파일 (S06HomeScreen / S07SongSelectScreen / RecordGuideScreen / RecordScreen) 에서:
 *
 * (1) REQ-001: 4 파일 모두 `useTheme(` 호출 1회 이상
 * (2) REQ-002: 본 task 가 처리한 토큰 (bgPrimary, surface, surfaceHigh, accentPrimary,
 *              textPrimary, textSecondary, overlay, textOnAccent 외 파일별 추가 토큰) 각 파일별
 *              expectedTokens 목록 모두 ≥1 회 참조
 * (3) REQ-003: 본 task 처리 hex 12종 + rgba 0건 잔존 (따옴표 내 인라인 리터럴 소거 확인)
 * (4) REQ-004: 4 대상 파일에 보류 hex 4종 (#82B090 / #E0B070 / #5A8A6A / #FF4444) 외
 *              6자리 hex 0건 잔존
 * (5) REQ-012: RecordScreen 에 `darkColors.` substring 0건 (useTheme 전환 완료)
 *
 * 구현 방식:
 * - Jest 환경 Node.js `fs.readFileSync` 로 파일 내용 읽기 (React Native 렌더 불필요)
 * - token 참조 = `colors.<tokenName>` 패턴 최소 1회
 * - 처리 hex grep = 따옴표 내 hex 리터럴 `/['"](<HEX>)['"]/gi` 패턴 0건
 *
 * 현재 상태 (engineer impl 전):
 * - REQ-001: 4 파일 모두 useTheme 미채택 → RED
 * - REQ-002: token 참조 없음 → RED
 * - REQ-003: 처리 대상 hex 잔존 → RED
 * - REQ-004: 처리 hex + 보류 hex 모두 잔존 → RED
 * - REQ-012: RecordScreen 에 darkColors. 존재 → RED
 *
 * engineer impl 후:
 * - REQ-001: 4 파일 모두 useTheme( 포함 → GREEN
 * - REQ-002: 파일별 expectedTokens 전수 참조 → GREEN
 * - REQ-003: 처리 hex 따옴표 내 0건 → GREEN
 * - REQ-004: 보류 4종 외 6자리 hex 0건 → GREEN
 * - REQ-012: RecordScreen darkColors. 0건 → GREEN
 *
 * 주의 — 보류 hex (의도적 잔존 — Story 5 task 09 후속 처리):
 * - `#82B090` (RecordGuide HeadphoneChip border/text × 2)
 * - `#E0B070` (RecordScreen bgmFailToast × 1)
 * - `#5A8A6A` (RecordScreen silenceWarning × 1)
 * - `#FF4444` (RecordScreen stopRing/stopBtn × 2)
 * 본 테스트는 이 hex 들을 REQ-003 검증 대상에 포함 X (plan §3.3 결정 B 옵션).
 *
 * 참조: task 02 paywall-processed-hex-map.test.ts / task 03 settings-deletion-processed-hex-map.test.ts 동일 패턴.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 대상 파일 경로 설정 ──────────────────────────────────────────────────────

/**
 * 테스트 파일 위치: apps/mobile/src/__tests__/theme/
 * 대상 파일 위치: apps/mobile/src/screens/
 * 상대 경로 기준: __dirname 에서 ../.. = apps/mobile/src
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

interface TargetFile {
  label: string;
  relativePath: string;
  /**
   * impl §4 보류 hex 카운트 표 기준 각 파일이 최소 참조해야 하는 token 목록.
   * "처리 토큰 참조 ≥1" 검증에 사용. 파일에 없는 토큰 포함 시 TEst FAIL.
   */
  expectedTokens: string[];
}

const TARGET_FILES: TargetFile[] = [
  {
    label: 'S06HomeScreen',
    relativePath: 'screens/S06HomeScreen.tsx',
    // plan §5.5: bgPrimary(×2), surface(×2), accentPrimary(×2), textPrimary(×1),
    //            textSecondary(×3), border(×1) = 6 토큰
    expectedTokens: [
      'bgPrimary',
      'surface',
      'accentPrimary',
      'textPrimary',
      'textSecondary',
      'border',
    ],
  },
  {
    label: 'S07SongSelectScreen',
    relativePath: 'screens/S07SongSelectScreen.tsx',
    // plan §5.5: bgPrimary(×2), surfaceHigh(×1), accentPrimary(×1),
    //            textPrimary(×1), textSecondary(×1) = 5 토큰
    expectedTokens: [
      'bgPrimary',
      'surfaceHigh',
      'accentPrimary',
      'textPrimary',
      'textSecondary',
    ],
  },
  {
    label: 'RecordGuideScreen',
    relativePath: 'screens/RecordGuideScreen.tsx',
    // plan §5.5: bgPrimary(×3), surface(×1), surfaceHigh(×1), accentPrimary(×3),
    //            textPrimary(×3), textSecondary(×4), overlay(×1) = 7 토큰
    expectedTokens: [
      'bgPrimary',
      'surface',
      'surfaceHigh',
      'accentPrimary',
      'textPrimary',
      'textSecondary',
      'overlay',
    ],
  },
  {
    label: 'RecordScreen',
    relativePath: 'screens/RecordScreen.tsx',
    // plan §5.5: bgPrimary(×2), accentPrimary(×1), accentSecondary(×1),
    //            textSecondary(×4), textBody(×1), textOnAccent(×1) = 6 토큰
    expectedTokens: [
      'bgPrimary',
      'accentPrimary',
      'accentSecondary',
      'textSecondary',
      'textBody',
      'textOnAccent',
    ],
  },
];

// ─── 검증 대상 정의 ───────────────────────────────────────────────────────────

/** REQ-001: useTheme 호출 검출 문자열 */
const USE_THEME_CALL = 'useTheme(';

/**
 * REQ-003: 본 task 가 처리한 hex 군 — 따옴표 내 인라인 리터럴로 잔존해선 안 됨.
 *
 * 처리 hex (plan §5.4 매핑 표 기준):
 * - 직접 매핑 7종: #0D0F1A(bgPrimary), #1A1D30(surface), #21253E(surfaceHigh),
 *                  #5A7AA8(accentPrimary), #7B80A0(textSecondary), #EEF0F8(textPrimary),
 *                  #fff/#FFFFFF(textOnAccent)
 * - 흡수 위험 등재 2종: #2A2E50→border, #A9B0D0→textBody
 * - alpha 흡수 1종: rgba(0,0,0,0.6)→overlay (별도 검증)
 *
 * 보류 hex (#82B090, #E0B070, #5A8A6A, #FF4444) 는 의도적 잔존 — 본 배열에 포함 X.
 *
 * 대소문자 무관 (i 플래그) — 소문자 hex 사용 가능성도 차단.
 */
const PROCESSED_HEX_LIST: string[] = [
  '#0D0F1A',
  '#1A1D30',
  '#21253E',
  '#5A7AA8',
  '#7B80A0',
  '#EEF0F8',
  '#2A2E50',  // border 흡수 위험 등재
  '#A9B0D0',  // textBody 흡수 위험 등재
  '#fff',     // textOnAccent — 3자리 hex
  '#FFFFFF',  // textOnAccent — 6자리 (소문자 #ffffff 는 대소문자 무관으로 처리)
];

/** REQ-003: rgba 형식 처리 hex */
const PROCESSED_RGBA = 'rgba(0,0,0,0.6)';

/**
 * REQ-004: 보류 hex — 잔존 허용 목록 (Story 5 task 09 처리 대기).
 * plan §3.3 결정 B 옵션. 대소문자 양쪽 포함.
 */
const ALLOWED_HEX_PENDING: string[] = [
  '#82B090', '#82b090',
  '#E0B070', '#e0b070',
  '#5A8A6A', '#5a8a6a',
  '#FF4444', '#ff4444',
];

// ─── Regex 빌더 ──────────────────────────────────────────────────────────────

/**
 * 처리 hex 가 따옴표 (작은따옴표 또는 큰따옴표) 안에 리터럴로 등장하는지 검출.
 * 예: `backgroundColor: '#0D0F1A'` → 매칭.
 * 예: `colors.bgPrimary` (토큰 참조) → 매칭 안 됨.
 * 대소문자 구분 없음 (i 플래그).
 */
function buildHexInQuotesRegex(hex: string): RegExp {
  const escaped = hex.replace('#', '#');
  return new RegExp(`['"]\\s*${escaped}\\s*['"]`, 'gi');
}

/**
 * `colors.<token>` 참조가 파일에 등장하는지 검출.
 */
function buildTokenRefRegex(token: string): RegExp {
  return new RegExp(`colors\\.${token}\\b`);
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function readSrc(relativePath: string): string {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  return fs.readFileSync(absolutePath, 'utf-8');
}

function hasUseThemeCall(content: string): boolean {
  return content.includes(USE_THEME_CALL);
}

function findHexInQuotes(content: string, hex: string): string[] {
  return content.match(buildHexInQuotesRegex(hex)) ?? [];
}

function hasTokenRef(content: string, token: string): boolean {
  return buildTokenRefRegex(token).test(content);
}

// ─── REQ-001: useTheme 호출 존재 검증 ────────────────────────────────────────

describe('REQ-001 task 05 — 4 파일 useTheme() 호출 검증', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label}: useTheme( 호출이 1회 이상 포함된다`, () => {
      const content = readSrc(relativePath);
      // engineer impl 전: useTheme 미채택 → false → RED
      // engineer impl 후: useTheme( 포함 → true → GREEN
      expect(hasUseThemeCall(content)).toBe(true);
    });
  }

  it('4 파일 모두 useTheme( 를 포함한다 (4/4 채택)', () => {
    const missing: string[] = [];
    for (const { label, relativePath } of TARGET_FILES) {
      if (!hasUseThemeCall(readSrc(relativePath))) {
        missing.push(label);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ─── REQ-002: 파일별 처리 토큰 참조 존재 검증 ────────────────────────────────

describe('REQ-002 task 05 — 4 파일 처리 토큰 참조 검증 (파일별 expectedTokens 전수)', () => {
  for (const { label, relativePath, expectedTokens } of TARGET_FILES) {
    it(`${label}: expectedTokens ${expectedTokens.length}종 모두 colors.<token> 참조 ≥1 회`, () => {
      const content = readSrc(relativePath);
      const missing = expectedTokens.filter((tok) => !hasTokenRef(content, tok));
      // engineer impl 전: token 참조 없음 → missing.length > 0 → RED
      // engineer impl 후: 모든 expectedTokens 참조 → missing 빈 배열 → GREEN
      // 실패 시 누락 토큰 목록 노출
      expect(missing).toEqual([]);
    });
  }
});

// 핵심 토큰 개별 검증 (디버깅 용이성)

describe('REQ-002 task 05 — 핵심 토큰 개별 검증', () => {
  it('S06HomeScreen 에 bgPrimary 토큰이 참조된다 (container/fabIcon bg — #0D0F1A)', () => {
    const content = readSrc('screens/S06HomeScreen.tsx');
    // engineer impl 전: '#0D0F1A' 직박 → RED
    // engineer impl 후: colors.bgPrimary → GREEN
    expect(hasTokenRef(content, 'bgPrimary')).toBe(true);
  });

  it('RecordGuideScreen 에 overlay 토큰이 참조된다 (modal overlay — rgba(0,0,0,0.6) 흡수)', () => {
    const content = readSrc('screens/RecordGuideScreen.tsx');
    // engineer impl 전: rgba(0,0,0,0.6) 직박 → RED
    // engineer impl 후: colors.overlay → GREEN
    expect(hasTokenRef(content, 'overlay')).toBe(true);
  });

  it('RecordScreen 에 textOnAccent 토큰이 참조된다 (stopIcon bg — #fff task04 신규)', () => {
    const content = readSrc('screens/RecordScreen.tsx');
    // engineer impl 전: '#fff' 직박 → RED
    // engineer impl 후: colors.textOnAccent → GREEN
    expect(hasTokenRef(content, 'textOnAccent')).toBe(true);
  });

  it('RecordScreen 에 textBody 토큰이 참조된다 (bgmChip — #A9B0D0 흡수 위험 등재)', () => {
    const content = readSrc('screens/RecordScreen.tsx');
    // engineer impl 전: '#A9B0D0' 직박 → RED
    // engineer impl 후: colors.textBody → GREEN
    expect(hasTokenRef(content, 'textBody')).toBe(true);
  });

  it('S06HomeScreen 에 border 토큰이 참조된다 (pendingCard borderColor — #2A2E50 흡수 위험 등재)', () => {
    const content = readSrc('screens/S06HomeScreen.tsx');
    // engineer impl 전: '#2A2E50' 직박 → RED
    // engineer impl 후: colors.border → GREEN
    expect(hasTokenRef(content, 'border')).toBe(true);
  });
});

// ─── REQ-003: 처리 hex 군 따옴표 내 잔존 0건 검증 ────────────────────────────

describe('REQ-003 task 05 — 처리 대상 hex 군 따옴표 내 리터럴 잔존 0건 검증', () => {
  /**
   * 처리 hex 는 token 참조로 완전 치환됐으므로 따옴표 안에 인라인으로 남아선 안 됨.
   * 보류 hex (#82B090, #E0B070, #5A8A6A, #FF4444) 는 검증 대상 외.
   */
  for (const { label, relativePath } of TARGET_FILES) {
    for (const hex of PROCESSED_HEX_LIST) {
      it(`${label}: 따옴표 내 ${hex} 인라인 리터럴 0건`, () => {
        const content = readSrc(relativePath);
        const matches = findHexInQuotes(content, hex);
        // engineer impl 전: hex 리터럴 잔존 → matches.length > 0 → RED
        // engineer impl 후: token 치환 완료 → matches.length === 0 → GREEN
        expect(matches).toEqual([]);
      });
    }

    it(`${label}: 따옴표 내 rgba(0,0,0,0.6) 인라인 리터럴 0건 (overlay 흡수)`, () => {
      const content = readSrc(relativePath);
      // engineer impl 전: rgba(...) 직박 → RED
      // engineer impl 후: colors.overlay → GREEN
      expect(content.includes(`'${PROCESSED_RGBA}'`)).toBe(false);
      expect(content.includes(`"${PROCESSED_RGBA}"`)).toBe(false);
    });
  }
});

// ─── REQ-003 통합: 4 파일 처리 hex 전수 잔존 총합 ────────────────────────────

describe('REQ-003 통합 task 05 — 처리 hex 군 4 파일 전수 잔존 총합 0건', () => {
  it('4 파일 전체에서 처리 대상 hex 따옴표 내 잔존 총합이 0건이다', () => {
    const allMatches: Array<{ file: string; hex: string; match: string }> = [];
    for (const { label, relativePath } of TARGET_FILES) {
      const content = readSrc(relativePath);
      for (const hex of PROCESSED_HEX_LIST) {
        const matches = findHexInQuotes(content, hex);
        matches.forEach((m) => allMatches.push({ file: label, hex, match: m }));
      }
    }
    // 실패 시 잔존 파일+hex+매칭 목록 노출
    expect(allMatches).toEqual([]);
  });
});

// ─── REQ-004: 보류 hex 외 6자리 hex 잔존 0건 검증 ────────────────────────────

describe('REQ-004 task 05 — 4 파일 보류 hex 외 6자리 hex 잔존 0건', () => {
  /**
   * Story 5 task 09 (전수 hex-lint) 머지 전까지의 1차 방어선.
   * 보류 4종 (#82B090, #E0B070, #5A8A6A, #FF4444) 외 6자리 hex 잔존 시 즉시 FAIL.
   * plan §11.7 "보류 4 hex 외 색 리터럴 0건 강제 (REQ-013 = REQ-003+REQ-004 통합)" 정합.
   */
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label}: 6자리 hex 중 보류 4종 (#82B090/#E0B070/#5A8A6A/#FF4444) 외 0건`, () => {
      const content = readSrc(relativePath);
      // 6자리 hex 전수 추출
      const allSixDigitHex = content.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
      // 보류 허용 목록 (대소문자 양쪽)
      const unexpected = allSixDigitHex.filter(
        (hex) => !ALLOWED_HEX_PENDING.includes(hex),
      );
      // 실패 시 비허용 잔존 hex 목록 노출 (디버깅)
      expect(unexpected).toEqual([]);
    });
  }

  it('4 파일 전체에서 보류 외 6자리 hex 잔존 총합 0건', () => {
    const allUnexpected: Array<{ file: string; hex: string }> = [];
    for (const { label, relativePath } of TARGET_FILES) {
      const content = readSrc(relativePath);
      const allSixDigitHex = content.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
      allSixDigitHex
        .filter((hex) => !ALLOWED_HEX_PENDING.includes(hex))
        .forEach((hex) => allUnexpected.push({ file: label, hex }));
    }
    expect(allUnexpected).toEqual([]);
  });
});

// ─── REQ-012: RecordScreen darkColors 직접 참조 제거 검증 ────────────────────

describe('REQ-012 task 05 — RecordScreen darkColors 직접 참조 제거', () => {
  it('RecordScreen 에 darkColors. substring 이 없다 (useTheme 전환 완료)', () => {
    const content = readSrc('screens/RecordScreen.tsx');
    // engineer impl 전: import { darkColors, ... } + darkColors.accentSecondary 참조 → RED
    // engineer impl 후: darkColors import 제거 + colors.accentSecondary 로 전환 → GREEN
    expect(content.includes('darkColors.')).toBe(false);
  });
});
