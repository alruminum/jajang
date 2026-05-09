/**
 * REQ-001 / REQ-002 / REQ-009 — M0 Settings + AccountDeletion 처리 hex → token 치환 검증
 *
 * 수용 기준:
 * - REQ-001: S16SettingsScreen, AccountDeletionScreen 양 파일 모두 `useTheme(` 호출 1회 이상
 * - REQ-002: task 03 §3.2.1 + §3.2.2 + §3.2.4 처리 토큰
 *            (`bgPrimary`, `surface`, `bgDeep`, `border`, `accentPrimary`, `textSecondary`,
 *             `destructive`, `overlay`) 이 각 파일 내 1회 이상 참조됨
 * - REQ-009: 처리 대상 hex 군
 *            (`#0D0F1A`, `#1A1D35`, `#1A1D30`, `#12152B`, `#2A2E48`, `#5A7AA8`, `#7B80A0`,
 *             `#FF5C5C`, `#FF6B6B`) 이 따옴표 내 hex 리터럴로 0건
 *            (factory 내 token 참조로 완전 치환됐음을 검증)
 *
 * 구현 방식:
 * - Jest 환경에서 Node.js `fs.readFileSync` 로 파일 내용 읽기 (React Native 렌더 불필요)
 * - useTheme 호출 = `useTheme(` 문자열 포함 여부 (최소 1회)
 * - token 참조 = `colors.<tokenName>` 패턴 (최소 1회)
 * - 처리 hex grep = 따옴표 내 hex 리터럴 `/['"](<HEX>)['"]/i` 패턴 0건
 *
 * 현재 상태 (engineer impl 전):
 * - REQ-001: 양 파일 모두 useTheme 미채택 → 2건 FAIL → RED
 * - REQ-002: token 참조 없음 → RED
 * - REQ-009: 처리 대상 hex 군이 인라인으로 잔존 → RED
 *
 * engineer impl 후:
 * - REQ-001: 양 파일 모두 useTheme( 포함 → GREEN
 * - REQ-002: 각 파일에서 token 참조 다수 → GREEN
 * - REQ-009: 처리 hex 군 따옴표 내 잔존 0건 → GREEN
 *
 * 주의 — 보류 hex (의도적 잔존):
 * - `#F5F5F5`, `#FFFFFF`, `#4A6FFF`, `#4A4E68`, `#E0E2F0`, `#B0B4CC`, `#2A1A0F`
 *   는 누락 토큰 후보 7종으로 task 04 (token-define) 후 일괄 교체 예정.
 *   본 테스트는 이 hex 들을 검증 대상에 포함 X (task 03 §3.2.5 + §4 보류 hex 잔존 의도된 상태).
 * - paywall-processed-hex-map.test.ts 와 동일 패턴 (보류 hex 잔존으로 전수 hex 0건 검증 불가).
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
    label: 'S16SettingsScreen',
    relativePath: 'screens/S16SettingsScreen.tsx',
  },
  {
    label: 'AccountDeletionScreen',
    relativePath: 'screens/AccountDeletionScreen.tsx',
  },
];

// ─── 검증 대상 정의 ───────────────────────────────────────────────────────────

/** useTheme 호출 검출 문자열 */
const USE_THEME_CALL = 'useTheme(';

/**
 * REQ-002: task 03 §3.2.1 + §3.2.2 + §3.2.4 의 처리 토큰 목록.
 * 각 파일에서 `colors.<token>` 패턴으로 최소 1회 참조됨을 검증.
 *
 * - bgPrimary: #0D0F1A (container bg — 양 파일 핵심 토큰)
 * - surface: #1A1D35 → #1A1D30 (4dp 흡수 — divider/header/footer/deleteItemList)
 * - bgDeep: #12152B (S16 badgeTextDark, AccDel modalSheet)
 * - border: #2A2E48 (S16 radioOuter border, logoutBtn border)
 * - accentPrimary: #5A7AA8 (S16 radioInner/radioOuterSelected/badgeTrial; AccDel radio/banner)
 * - textSecondary: #7B80A0 (S16 ActivityIndicator/themeSectionTitle/logoutText; AccDel sectionSubtitle/cancelText)
 * - destructive: #FF5C5C/#FF6B6B → 흡수 (S16 rowLabelDestructive; AccDel irreversibleText/confirmDeleteBtn)
 * - overlay: rgba(0,0,0,0.6) → 흡수 (AccDel modalOverlay)
 */
const PROCESSED_TOKENS: string[] = [
  'bgPrimary',
  'surface',
  'bgDeep',
  'border',
  'accentPrimary',
  'textSecondary',
  'destructive',
  'overlay',
];

/**
 * REQ-009: 본 task 03 처리 대상 hex 군 — 따옴표 내 인라인 리터럴로 잔존해선 안 됨.
 *
 * 처리 hex 정의 (task 03 §3.2 매핑):
 * - §3.2.1 직접 매핑 5종: #0D0F1A (bgPrimary), #12152B (bgDeep), #2A2E48 (border),
 *                         #5A7AA8 (accentPrimary), #7B80A0 (textSecondary)
 * - §3.2.2 4dp 흡수 2종: #1A1D35 → surface (#1A1D30), rgba 는 hex regex 불해당
 * - §3.2.2 surface 토큰 hex 값 자체 (#1A1D30) — factory 내부에서도 직접 참조 불가
 * - §3.2.4 destructive 흡수 2종: #FF5C5C, #FF6B6B
 *
 * 보류 hex (#F5F5F5, #FFFFFF, #4A6FFF, #4A4E68, #E0E2F0, #B0B4CC, #2A1A0F)
 * 는 의도적 잔존 — 본 배열에 포함 X.
 *
 * 대소문자 무관 (i 플래그) — 구현에서 소문자 hex 사용 가능성 차단.
 */
const PROCESSED_HEX_LIST: string[] = [
  '#0D0F1A',
  '#1A1D35',
  '#1A1D30',
  '#12152B',
  '#2A2E48',
  '#5A7AA8',
  '#7B80A0',
  '#FF5C5C',
  '#FF6B6B',
];

// ─── Regex 빌더 ──────────────────────────────────────────────────────────────

/**
 * 처리 hex 가 따옴표 (작은따옴표 또는 큰따옴표) 안에 리터럴로 등장하는지 검출.
 * 예: `backgroundColor: '#0D0F1A'` → 매칭.
 * 예: `colors.bgPrimary` (토큰 참조) → 매칭 안 됨.
 * 대소문자 구분 없음 (i 플래그).
 */
function buildProcessedHexRegex(hex: string): RegExp {
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

describe('REQ-001 — 대상 2 파일 useTheme() 호출 검증', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 useTheme( 호출이 1회 이상 포함된다`, () => {
      const content = readFile(relativePath);
      // engineer impl 전: useTheme 미채택 → false → RED
      // engineer impl 후: useTheme( 포함 → true → GREEN
      expect(hasUseThemeCall(content)).toBe(true);
    });
  }

  it('2 파일 모두 useTheme( 를 포함한다 (2/2 채택)', () => {
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

// ─── REQ-002: 처리 토큰 참조 존재 검증 ───────────────────────────────────────

describe('REQ-002 — 대상 2 파일 처리 토큰 참조 검증', () => {
  /**
   * 파일별로 처리 토큰 목록 중 최소 4개가 참조됐는지 확인.
   * impl §9 REQ-002 "각 파일에서 최소 4개 토큰 참조 확인" 기준 적용.
   * (task 01 의 3개 기준에서 상향 — task 03 은 8개 처리 토큰으로 더 많음)
   */
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 처리 토큰이 4개 이상 참조된다`, () => {
      const content = readFile(relativePath);
      const referencedTokens = PROCESSED_TOKENS.filter((token) =>
        hasTokenRef(content, token),
      );
      // engineer impl 전: token 참조 0 → referencedTokens.length < 4 → RED
      // engineer impl 후: 처리 hex ~13-14건 토큰화 → 다수 token 참조 → GREEN
      expect(referencedTokens.length).toBeGreaterThanOrEqual(4);
    });
  }

  // 핵심 토큰 개별 검증 (디버깅 용이성)
  it('S16SettingsScreen 에 bgPrimary 토큰이 참조된다 (container bg — 핵심 처리 hex #0D0F1A)', () => {
    const content = readFile('screens/S16SettingsScreen.tsx');
    // engineer impl 전: colors.bgPrimary 없음 → RED
    // engineer impl 후: container { backgroundColor: colors.bgPrimary } → GREEN
    expect(hasTokenRef(content, 'bgPrimary')).toBe(true);
  });

  it('AccountDeletionScreen 에 bgPrimary 토큰이 참조된다 (container bg — 핵심 처리 hex #0D0F1A)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    expect(hasTokenRef(content, 'bgPrimary')).toBe(true);
  });

  it('S16SettingsScreen 에 destructive 토큰이 참조된다 (rowLabelDestructive — #FF5C5C 흡수)', () => {
    const content = readFile('screens/S16SettingsScreen.tsx');
    // engineer impl 전: '#FF5C5C' 직박 → RED
    // engineer impl 후: colors.destructive 참조 → GREEN
    expect(hasTokenRef(content, 'destructive')).toBe(true);
  });

  it('AccountDeletionScreen 에 destructive 토큰이 참조된다 (confirmDeleteBtn bg — #FF6B6B 흡수)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    // engineer impl 전: '#FF6B6B' 직박 → RED
    // engineer impl 후: colors.destructive 참조 → GREEN
    expect(hasTokenRef(content, 'destructive')).toBe(true);
  });

  it('AccountDeletionScreen 에 overlay 토큰이 참조된다 (modalOverlay bg — rgba(0,0,0,0.6) 흡수)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    // engineer impl 전: rgba(0,0,0,0.6) 직박 → RED
    // engineer impl 후: colors.overlay 참조 → GREEN
    expect(hasTokenRef(content, 'overlay')).toBe(true);
  });

  it('S16SettingsScreen 에 accentPrimary 토큰이 참조된다 (radioInner bg — #5A7AA8)', () => {
    const content = readFile('screens/S16SettingsScreen.tsx');
    expect(hasTokenRef(content, 'accentPrimary')).toBe(true);
  });
});

// ─── REQ-009: 처리 hex 군 따옴표 내 잔존 0건 검증 ───────────────────────────

describe('REQ-009 — 처리 대상 hex 군 따옴표 내 리터럴 잔존 0건 검증', () => {
  /**
   * 처리 hex 는 token 참조로 완전 치환됐으므로 따옴표 안에 인라인으로 남아선 안 됨.
   * 보류 hex (#F5F5F5, #FFFFFF, #4A6FFF, #4A4E68, #E0E2F0, #B0B4CC, #2A1A0F)
   * 는 의도적 잔존 — 검증 대상 외.
   */
  for (const { label, relativePath } of TARGET_FILES) {
    for (const hex of PROCESSED_HEX_LIST) {
      it(`${label} 에 따옴표 내 ${hex} 인라인 리터럴이 없다 (0건)`, () => {
        const content = readFile(relativePath);
        const matches = findProcessedHexMatches(content, hex);
        // engineer impl 전: hex 리터럴 잔존 → matches.length > 0 → RED
        // engineer impl 후: token 치환 완료 → matches.length === 0 → GREEN
        //
        // 실패 시 잔존 매칭 목록이 메시지에 포함돼 디버깅 용이
        expect(matches).toEqual([]);
      });
    }
  }
});

// ─── REQ-009 통합: 2 파일 전수 처리 hex 총합 ─────────────────────────────────

describe('REQ-009 통합 — 처리 hex 군 2 파일 전수 잔존 총합', () => {
  it('2 파일 전체에서 처리 대상 hex 따옴표 내 잔존 총합이 0건이다', () => {
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
});
