/**
 * REQ-001 / REQ-002 / REQ-007 — M0 결제·구독 화면 처리 hex → token 치환 검증
 *
 * 수용 기준:
 * - REQ-001: S14UpgradeSheet, S15SubscribeScreen, S17TrialExpiredScreen 3 파일 모두 `useTheme(` 호출 1회 이상
 * - REQ-002: task 01 매핑표 §3.2.1 + §3.2.2 토큰 (bgPrimary, surface, surfaceHigh, bgDeep,
 *            accentPrimary, textPrimary, textSecondary, border, overlay) 이 각 파일 내 1회 이상 참조됨
 * - REQ-007: 처리 대상 hex 군 (#0D0F1A, #1A1D35, #1A1D30, #1E2340, #21253E, #12152B,
 *            #5A7AA8, #7B80A0, #EEF0F8, #2A2E48) 이 따옴표 내 hex 리터럴로 0건
 *            (factory 내 token 참조로 완전 치환됐음을 검증)
 *
 * 구현 방식:
 * - Jest 환경에서 Node.js `fs.readFileSync` 로 파일 내용 읽기 (React Native 렌더 불필요)
 * - useTheme 호출 = `useTheme(` 문자열 포함 여부 (최소 1회)
 * - token 참조 = `colors.<tokenName>` 패턴 (최소 1회)
 * - 처리 hex grep = 따옴표 내 hex 리터럴 `/['"](#HEX)['"]/i` 패턴 0건
 *
 * 현재 상태 (engineer impl 전):
 * - REQ-001: 3 파일 모두 useTheme 미채택 → 3건 FAIL → RED
 * - REQ-002: token 참조 없음 → RED
 * - REQ-007: 처리 대상 hex 군이 인라인으로 잔존 → RED
 *
 * engineer impl 후:
 * - REQ-001: 3 파일 모두 useTheme( 포함 → GREEN
 * - REQ-002: 각 파일에서 token 참조 다수 → GREEN
 * - REQ-007: 처리 hex 군 따옴표 내 잔존 0건 → GREEN
 *
 * 주의 (task 01 auth-onboarding-no-raw-hex.test.ts 와의 차이):
 * - 본 task 는 보류 hex 잔존 (#F5F5F5, #A0A5C0, #4A6FFF, #FFFFFF, #4A4E68,
 *   rgba(30,34,60,0.95)) 이 의도적으로 남음 — 전수 hex 0건 검증 X.
 * - 오직 "처리 대상 hex 군" 만 0건 검증. 보류 hex 는 본 테스트 검증 대상 외.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 대상 파일 경로 설정 ──────────────────────────────────────────────────────

/**
 * 테스트 파일 위치: apps/mobile/src/__tests__/theme/
 * 대상 파일 위치: apps/mobile/src/screens/
 * 상대 경로 기준: __dirname 에서 ../../.. = apps/mobile/src
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FILES: Array<{ label: string; relativePath: string }> = [
  {
    label: 'S14UpgradeSheet',
    relativePath: 'screens/S14UpgradeSheet.tsx',
  },
  {
    label: 'S15SubscribeScreen',
    relativePath: 'screens/S15SubscribeScreen.tsx',
  },
  {
    label: 'S17TrialExpiredScreen',
    relativePath: 'screens/S17TrialExpiredScreen.tsx',
  },
];

// ─── 검증 대상 정의 ───────────────────────────────────────────────────────────

/** useTheme 호출 검출 문자열 */
const USE_THEME_CALL = 'useTheme(';

/**
 * REQ-002: task 01 매핑표 §3.2.1 + §3.2.2 의 처리 토큰 목록.
 * 각 파일에서 `colors.<token>` 패턴으로 최소 1회 참조됨을 검증.
 */
const PROCESSED_TOKENS: string[] = [
  'bgPrimary',
  'surface',
  'surfaceHigh',
  'bgDeep',
  'accentPrimary',
  'textPrimary',
  'textSecondary',
  'border',
  'overlay',
];

/**
 * REQ-007: 본 task 처리 대상 hex 군 — 따옴표 내 인라인 리터럴로 잔존해선 안 됨.
 * 대소문자 무관 (impl §9 REQ-007 에서 대문자 정규식 언급이나 소문자 잔존 가능성도 차단).
 *
 * 보류 hex (#F5F5F5, #A0A5C0, #4A6FFF, #FFFFFF, #4A4E68, rgba(30,34,60,0.95))
 * 는 의도적 잔존 — 본 배열에 포함 X.
 */
const PROCESSED_HEX_LIST: string[] = [
  '#0D0F1A',
  '#1A1D35',
  '#1A1D30',
  '#1E2340',
  '#21253E',
  '#12152B',
  '#5A7AA8',
  '#7B80A0',
  '#EEF0F8',
  '#2A2E48',
];

// ─── Regex 빌더 ──────────────────────────────────────────────────────────────

/**
 * 처리 hex 가 따옴표 (작은따옴표 또는 큰따옴표) 안에 리터럴로 등장하는지 검출.
 * 예: `backgroundColor: '#0D0F1A'` → 매칭.
 * 예: `colors.bgPrimary` (토큰 참조) → 매칭 안 됨.
 * 대소문자 구분 없음 (i 플래그).
 */
function buildProcessedHexRegex(hex: string): RegExp {
  // hex 특수문자 이스케이프 불필요 (# 과 영숫자만 포함)
  return new RegExp(`['"]\\s*${hex}\\s*['"]`, 'gi');
}

/**
 * `colors.<token>` 참조가 파일에 등장하는지 검출.
 */
function buildTokenRefRegex(token: string): RegExp {
  return new RegExp(`colors\\.${token}\\b`);
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function readFile(relativePath: string): string {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  return fs.readFileSync(absolutePath, 'utf-8');
}

function hasUseThemeCall(content: string): boolean {
  return content.includes(USE_THEME_CALL);
}

function findProcessedHexMatches(content: string, hex: string): string[] {
  const regex = buildProcessedHexRegex(hex);
  return content.match(regex) ?? [];
}

function hasTokenRef(content: string, token: string): boolean {
  return buildTokenRefRegex(token).test(content);
}

// ─── REQ-001: useTheme 호출 존재 검증 ────────────────────────────────────────

describe('REQ-001 — 대상 3 파일 useTheme() 호출 검증', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 useTheme( 호출이 1회 이상 포함된다`, () => {
      const content = readFile(relativePath);
      // engineer impl 전: useTheme 미채택 → false → RED
      // engineer impl 후: useTheme( 포함 → true → GREEN
      expect(hasUseThemeCall(content)).toBe(true);
    });
  }
});

// ─── REQ-002: 처리 토큰 참조 존재 검증 ───────────────────────────────────────

describe('REQ-002 — 대상 3 파일 처리 토큰 참조 검증', () => {
  /**
   * 파일별로 처리 토큰 목록 중 최소 3개가 참조됐는지 확인.
   * impl §9 REQ-002 "각 파일에서 최소 3개 토큰 참조 확인" 기준 적용.
   */
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 처리 토큰이 3개 이상 참조된다`, () => {
      const content = readFile(relativePath);
      const referencedTokens = PROCESSED_TOKENS.filter((token) =>
        hasTokenRef(content, token),
      );
      // engineer impl 전: token 참조 0 → referencedTokens.length < 3 → RED
      // engineer impl 후: 처리 hex 28건 토큰화 → 다수 token 참조 → GREEN
      expect(referencedTokens.length).toBeGreaterThanOrEqual(3);
    });
  }

  // 파일별 개별 토큰 참조 검증 (디버깅 용이성)
  it('S15SubscribeScreen 에 bgPrimary 토큰이 참조된다 (container bg — 핵심 처리 hex #0D0F1A)', () => {
    const content = readFile('screens/S15SubscribeScreen.tsx');
    // engineer impl 전: colors.bgPrimary 없음 → RED
    // engineer impl 후: container { backgroundColor: colors.bgPrimary } → GREEN
    expect(hasTokenRef(content, 'bgPrimary')).toBe(true);
  });

  it('S17TrialExpiredScreen 에 bgPrimary 토큰이 참조된다 (container bg — 핵심 처리 hex #0D0F1A)', () => {
    const content = readFile('screens/S17TrialExpiredScreen.tsx');
    expect(hasTokenRef(content, 'bgPrimary')).toBe(true);
  });

  it('S14UpgradeSheet 에 surface 토큰이 참조된다 (sheet bg — 처리 hex #1A1D35 흡수)', () => {
    const content = readFile('screens/S14UpgradeSheet.tsx');
    // engineer impl 전: colors.surface 없음 → RED
    // engineer impl 후: sheetContainer { backgroundColor: colors.surface } → GREEN
    expect(hasTokenRef(content, 'surface')).toBe(true);
  });
});

// ─── REQ-007: 처리 hex 군 따옴표 내 잔존 0건 검증 ───────────────────────────

describe('REQ-007 — 처리 대상 hex 군 따옴표 내 리터럴 잔존 0건 검증', () => {
  /**
   * 처리 hex 는 token 참조로 완전 치환됐으므로 따옴표 안에 인라인으로 남아선 안 됨.
   * 보류 hex (#F5F5F5, #A0A5C0, #4A6FFF, #FFFFFF, #4A4E68) 는 검증 대상 외.
   */
  for (const { label, relativePath } of TARGET_FILES) {
    for (const hex of PROCESSED_HEX_LIST) {
      it(`${label} 에 따옴표 내 ${hex} 인라인 리터럴이 없다 (0건)`, () => {
        const content = readFile(relativePath);
        const matches = findProcessedHexMatches(content, hex);
        // engineer impl 전: hex 리터럴 잔존 → matches.length > 0 → RED
        // engineer impl 후: token 치환 완료 → matches.length === 0 → GREEN
        //
        // 실패 시 잔존 매칭 목록을 메시지에 포함해 디버깅 용이하게 함
        expect(matches).toEqual([]);
      });
    }
  }
});

// ─── REQ-007 통합: 3 파일 전수 처리 hex 총합 ─────────────────────────────────

describe('REQ-007 통합 — 처리 hex 군 3 파일 전수 잔존 총합', () => {
  it('3 파일 전체에서 처리 대상 hex 따옴표 내 잔존 총합이 0건이다', () => {
    const allMatches: Array<{ file: string; hex: string; match: string }> = [];
    for (const { label, relativePath } of TARGET_FILES) {
      const content = readFile(relativePath);
      for (const hex of PROCESSED_HEX_LIST) {
        const matches = findProcessedHexMatches(content, hex);
        matches.forEach((m) => allMatches.push({ file: label, hex, match: m }));
      }
    }
    // 실패 시 잔존 파일+hex+매칭 목록 노출
    expect(allMatches).toEqual([]);
  });

  it('3 파일 모두 useTheme( 를 포함한다 (3/3 채택)', () => {
    const missing: string[] = [];
    for (const { label, relativePath } of TARGET_FILES) {
      const content = readFile(relativePath);
      if (!hasUseThemeCall(content)) {
        missing.push(label);
      }
    }
    // 실패 시 미채택 파일 목록 노출
    expect(missing).toEqual([]);
  });
});
