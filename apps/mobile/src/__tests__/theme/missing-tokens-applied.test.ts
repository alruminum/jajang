/**
 * task 04 missing-tokens-define-and-apply — REQ-005 / REQ-006 / REQ-012
 *
 * 5 대상 파일 (S14/S15/S16/S17/AccDel) 에서:
 * (1) REQ-005/REQ-012: 본 task 가 토큰화한 9 hex 가 *따옴표 내 문자열 리터럴* 위치에 0건
 *     rgba(30, 34, 60, 0.95) 도 동일 — 0건 검증
 * (2) REQ-006: 신규 토큰 9종 (`colors.textHighlight` 등) 참조 ≥1 회 — positive assertion
 *
 * 구현 방식:
 * - Jest 환경에서 Node.js `fs.readFileSync` 로 파일 내용 읽기 (React Native 렌더 불필요)
 * - 처리 hex grep = 따옴표 내 hex 리터럴 `/['"]<HEX>['"]/g` 패턴 0건
 * - 신규 토큰 참조 = `colors.<tokenName>` 문자열 포함 여부 (최소 1회)
 *
 * 현재 상태 (engineer impl 전 — TDD RED):
 * - REQ-005/REQ-012: 44 hex 리터럴 + 2 rgba 잔존 → FAIL → RED
 * - REQ-006: 신규 토큰 참조 0건 → FAIL → RED
 *
 * engineer impl 후:
 * - REQ-005/REQ-012: 5 파일 처리 hex 0건 → GREEN
 * - REQ-006: 5 파일 신규 토큰 9종 중 ≥1 참조 → GREEN
 *
 * task 09 (hex-lint) 도입 전까지의 1차 회귀 방지선.
 * task 09 head 에서 본 테스트 통합 또는 별도 유지 결정.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 경로 설정 ────────────────────────────────────────────────────────────────

/**
 * 테스트 파일 위치: apps/mobile/src/__tests__/theme/
 * 대상 파일 위치: apps/mobile/src/screens/
 * SRC_ROOT = apps/mobile/src  (path.resolve(__dirname, '..', '..') 와 동일)
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FILES: Array<{ label: string; relativePath: string }> = [
  { label: 'S14UpgradeSheet',       relativePath: 'screens/S14UpgradeSheet.tsx' },
  { label: 'S15SubscribeScreen',    relativePath: 'screens/S15SubscribeScreen.tsx' },
  { label: 'S16SettingsScreen',     relativePath: 'screens/S16SettingsScreen.tsx' },
  { label: 'S17TrialExpiredScreen', relativePath: 'screens/S17TrialExpiredScreen.tsx' },
  { label: 'AccountDeletionScreen', relativePath: 'screens/AccountDeletionScreen.tsx' },
];

// ─── 검증 대상 정의 ───────────────────────────────────────────────────────────

/**
 * REQ-005/REQ-012: 5 대상 파일에서 *완전 제거* 되어야 할 hex 리터럴 9종.
 * 따옴표 내 문자열 리터럴로 잔존해선 안 됨.
 *
 * 출처: plan §2 표 (task 02/03 보류 hex 군) + plan §4.3 교체 매핑 표.
 *
 * 주의: '#FFFFFF' 는 5 대상 파일 한정 검증. 다른 파일의 '#FFFFFF' 는 본 테스트 범위 외.
 */
const REPLACED_HEX_LITERALS: string[] = [
  '#F5F5F5',  // → colors.textHighlight
  '#A0A5C0',  // → colors.textBody
  '#E0E2F0',  // → colors.textBodyHigh
  '#B0B4CC',  // → colors.textBodyMuted
  '#FFFFFF',  // → colors.textOnAccent (5 대상 파일 한정)
  '#4A4E68',  // → colors.textMuted
  '#4A6FFF',  // → colors.interactive
  '#2A1A0F',  // → colors.destructiveBg
];

/**
 * rgba 리터럴 — 작은따옴표 또는 큰따옴표로 감싸진 형태 검증.
 * 출처: plan §2 표 — S14/S15 에 잔존하던 rgba(30, 34, 60, 0.95) → colors.toastBg
 */
const REPLACED_RGBA = 'rgba(30, 34, 60, 0.95)';

/**
 * REQ-006: 신규 토큰 9종 참조 — 각 파일에서 최소 1회 이상 등장해야 함.
 * 출처: plan §4.1 ColorTokens 신규 9 토큰 목록.
 */
const NEW_TOKEN_REFS: string[] = [
  'colors.textHighlight',
  'colors.textBody',
  'colors.textBodyHigh',
  'colors.textBodyMuted',
  'colors.textOnAccent',
  'colors.textMuted',
  'colors.interactive',
  'colors.destructiveBg',
  'colors.toastBg',
];

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function readFile(relativePath: string): string {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  return fs.readFileSync(absolutePath, 'utf-8');
}

/**
 * hex 가 따옴표 (작은따옴표 또는 큰따옴표) 안에 리터럴로 등장하는지 검출.
 * 예: `backgroundColor: '#F5F5F5'` → 매칭.
 * 예: `colors.textHighlight` (토큰 참조) → 매칭 안 됨.
 * 대소문자 구분 없음 (i 플래그 — 소문자 잔존 가능성 차단).
 */
function buildHexLiteralRegex(hex: string): RegExp {
  return new RegExp(`['"]\\s*${hex.replace('#', '#')}\\s*['"]`, 'gi');
}

function findHexMatches(content: string, hex: string): string[] {
  return content.match(buildHexLiteralRegex(hex)) ?? [];
}

// ─── REQ-005/REQ-012: 처리 hex 9종 따옴표 내 리터럴 잔존 0건 (파일별) ──────────

describe('REQ-005/REQ-012 — 처리 hex 9종: 5 대상 파일 따옴표 내 리터럴 잔존 0건', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    for (const hex of REPLACED_HEX_LITERALS) {
      it(`${label}: 따옴표 내 '${hex}' 리터럴이 없다 (0건)`, () => {
        const content = readFile(relativePath);
        const matches = findHexMatches(content, hex);
        // engineer impl 전: hex 리터럴 잔존 → matches.length > 0 → RED
        // engineer impl 후: token 치환 완료 → matches.length === 0 → GREEN
        expect(matches).toEqual([]);
      });
    }
  }
});

// ─── REQ-005/REQ-012: rgba 잔존 0건 (파일별) ─────────────────────────────────

describe('REQ-005/REQ-012 — rgba(30, 34, 60, 0.95): 5 대상 파일 잔존 0건', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label}: 따옴표 내 '${REPLACED_RGBA}' 리터럴이 없다 (0건)`, () => {
      const content = readFile(relativePath);
      // 작은따옴표 + 큰따옴표 양쪽 검사
      expect(content.includes(`'${REPLACED_RGBA}'`)).toBe(false);
      expect(content.includes(`"${REPLACED_RGBA}"`)).toBe(false);
    });
  }
});

// ─── REQ-005/REQ-012 통합: 5 파일 처리 hex 총합 0건 ──────────────────────────

describe('REQ-005/REQ-012 통합 — 처리 hex 9종 + rgba: 5 파일 전수 잔존 총합 0건', () => {
  it('5 파일 전체에서 처리 대상 hex 따옴표 내 잔존 총합이 0건이다', () => {
    const allMatches: Array<{ file: string; hex: string; match: string }> = [];

    for (const { label, relativePath } of TARGET_FILES) {
      const content = readFile(relativePath);

      for (const hex of REPLACED_HEX_LITERALS) {
        const matches = findHexMatches(content, hex);
        matches.forEach((m) => allMatches.push({ file: label, hex, match: m }));
      }

      // rgba 검사
      if (content.includes(`'${REPLACED_RGBA}'`)) {
        allMatches.push({ file: label, hex: 'rgba', match: `'${REPLACED_RGBA}'` });
      }
      if (content.includes(`"${REPLACED_RGBA}"`)) {
        allMatches.push({ file: label, hex: 'rgba', match: `"${REPLACED_RGBA}"` });
      }
    }

    // 실패 시 잔존 파일+hex+매칭 목록 노출 → engineer 재검토 위치 즉시 식별 가능
    expect(allMatches).toEqual([]);
  });
});

// ─── REQ-006: 신규 토큰 9종 참조 ≥1회 (파일별) ──────────────────────────────

describe('REQ-006 — 신규 토큰 9종: 5 대상 파일에서 colors.<토큰> 참조 ≥1회', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label}: 신규 토큰 9종 중 1개 이상이 colors.<토큰> 형태로 참조된다`, () => {
      const content = readFile(relativePath);
      const foundTokens = NEW_TOKEN_REFS.filter((tokenRef) =>
        content.includes(tokenRef),
      );
      // engineer impl 전: 신규 토큰 참조 0 → foundTokens.length === 0 → RED
      // engineer impl 후: 각 파일의 보류 hex 교체 → 해당 토큰 참조 ≥1 → GREEN
      expect(foundTokens.length).toBeGreaterThanOrEqual(1);
    });
  }
});

// ─── REQ-006 상세: 파일별 예상 토큰 참조 검증 (plan §2 표 기반) ────────────────

describe('REQ-006 상세 — 파일별 예상 신규 토큰 참조 (plan §2 표 보류 hex 기반)', () => {
  it('S14UpgradeSheet: colors.textHighlight 참조됨 (#F5F5F5×2 교체)', () => {
    const content = readFile('screens/S14UpgradeSheet.tsx');
    expect(content.includes('colors.textHighlight')).toBe(true);
  });

  it('S14UpgradeSheet: colors.toastBg 참조됨 (rgba(30,34,60,0.95) 교체)', () => {
    const content = readFile('screens/S14UpgradeSheet.tsx');
    expect(content.includes('colors.toastBg')).toBe(true);
  });

  it('S15SubscribeScreen: colors.textHighlight 참조됨 (#F5F5F5×4 교체)', () => {
    const content = readFile('screens/S15SubscribeScreen.tsx');
    expect(content.includes('colors.textHighlight')).toBe(true);
  });

  it('S15SubscribeScreen: colors.interactive 참조됨 (#4A6FFF×2 교체)', () => {
    const content = readFile('screens/S15SubscribeScreen.tsx');
    expect(content.includes('colors.interactive')).toBe(true);
  });

  it('S15SubscribeScreen: colors.textMuted 참조됨 (#4A4E68×2 교체)', () => {
    const content = readFile('screens/S15SubscribeScreen.tsx');
    expect(content.includes('colors.textMuted')).toBe(true);
  });

  it('S16SettingsScreen: colors.textMuted 참조됨 (#4A4E68×4 교체)', () => {
    const content = readFile('screens/S16SettingsScreen.tsx');
    expect(content.includes('colors.textMuted')).toBe(true);
  });

  it('S16SettingsScreen: colors.textBodyHigh 참조됨 (#E0E2F0×2 교체)', () => {
    const content = readFile('screens/S16SettingsScreen.tsx');
    expect(content.includes('colors.textBodyHigh')).toBe(true);
  });

  it('S17TrialExpiredScreen: colors.textBody 참조됨 (#A0A5C0×2 교체)', () => {
    const content = readFile('screens/S17TrialExpiredScreen.tsx');
    expect(content.includes('colors.textBody')).toBe(true);
  });

  it('S17TrialExpiredScreen: colors.interactive 참조됨 (#4A6FFF 교체)', () => {
    const content = readFile('screens/S17TrialExpiredScreen.tsx');
    expect(content.includes('colors.interactive')).toBe(true);
  });

  it('AccountDeletionScreen: colors.destructiveBg 참조됨 (#2A1A0F 교체)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    expect(content.includes('colors.destructiveBg')).toBe(true);
  });

  it('AccountDeletionScreen: colors.textBodyHigh 참조됨 (#E0E2F0×2 교체)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    expect(content.includes('colors.textBodyHigh')).toBe(true);
  });

  it('AccountDeletionScreen: colors.textBodyMuted 참조됨 (#B0B4CC 교체)', () => {
    const content = readFile('screens/AccountDeletionScreen.tsx');
    expect(content.includes('colors.textBodyMuted')).toBe(true);
  });
});
