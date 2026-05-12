/**
 * task 06 m1b-play-pending-nav — REQ-001 / REQ-003 / REQ-004
 *
 * 4 대상 파일 (S11PreviewScreen / S12GeneratingScreen / S13PlayScreen / MainNavigator) 에서:
 *
 * (1) 본 task 가 토큰화한 10 hex (기존 토큰 9종 + task 04 destructiveBg 흡수 1종)
 *     + 3자리 hex 변형 (#fff / #FFF / #000)
 *     가 따옴표 내 인라인 리터럴로 잔존 0건 강제.
 * (2) 보류 hex 2종 (#FF6B6B / #5A8A6A) 은 *잔존 허용 + 명시* — task 09 위임.
 * (3) 신규 토큰 참조 (colors.<token>) ≥1 회 강제.
 * (4) useTheme 도입 (import 또는 호출) ≥1 회 강제.
 *
 * RecordModeScreen.tsx 는 plan §3.4 결정 α (skip) 에 따라 본 회귀 테스트 대상 외.
 *
 * 현재 상태 (engineer impl 전):
 * - describe 1 (처리 hex 잔존 0): 4 파일 모두 hex 리터럴 잔존 → RED
 * - describe 2 (보류 hex 명시): S11PreviewScreen 에 #FF6B6B / #5A8A6A 존재 → GREEN (의도적 잔존)
 * - describe 3 (신규 토큰 참조 ≥1): 토큰 참조 없음 → RED
 * - describe 4 (useTheme 도입): useTheme 미채택 → RED
 *
 * engineer impl 후:
 * - describe 1: 처리 hex 10종 + 3자리 변형 따옴표 내 0건 → GREEN
 * - describe 2: 보류 hex 2종 잔존 유지 → GREEN (계속)
 * - describe 3: 각 파일 colors.<token> ≥1 → GREEN
 * - describe 4: 각 파일 useTheme 포함 → GREEN
 *
 * 참조: task 05 m1a-core-flow-processed-hex-map.test.ts 동일 패턴.
 * 출처: plan §4.5 회귀 테스트 코드 (engineer 1:1 옮김).
 *
 * 경로 주의:
 *   __dirname = apps/mobile/src/__tests__/theme
 *   SRC_ROOT  = path.resolve(__dirname, '..', '..') = apps/mobile/src
 *   TARGET_FILES 의 relativePath 는 SRC_ROOT 기준 (src/ prefix 없음).
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 대상 파일 경로 ───────────────────────────────────────────────────────────

/**
 * 테스트 파일 위치: apps/mobile/src/__tests__/theme/
 * SRC_ROOT = __dirname 에서 ../.. = apps/mobile/src
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

/**
 * 대상 4 파일 (SRC_ROOT 기준 상대 경로).
 * RecordModeScreen.tsx 제외 — plan §3.4 skip α.
 */
const TARGET_FILES = [
  'screens/S11PreviewScreen.tsx',
  'screens/S12GeneratingScreen.tsx',
  'screens/S13PlayScreen.tsx',
  'navigation/MainNavigator.tsx',
  // RecordModeScreen.tsx 제외 — plan §3.4 skip α
];

// ─── 검증 대상 정의 ───────────────────────────────────────────────────────────

/**
 * task 06 가 토큰화한 hex (positive — 0건 강제).
 *
 * 기존 토큰 9종 직접 매핑 (plan §3.2.1):
 *   #0D0F1A → colors.bgPrimary
 *   #12152B → colors.bgDeep
 *   #1A1D30 → colors.surface
 *   #21253E → colors.surfaceHigh
 *   #2A2E48 → colors.border
 *   #5A7AA8 → colors.accentPrimary
 *   #7B80A0 → colors.textSecondary
 *   #C49A8A → colors.accentSecondary
 *   #EEF0F8 → colors.textPrimary
 * task 04 신규 흡수 1종 (plan §3.2.2):
 *   #2A1A1A → colors.destructiveBg
 */
const PROCESSED_HEX_LITERALS = [
  '#0D0F1A',
  '#12152B',
  '#1A1D30',
  '#21253E',
  '#2A2E48',
  '#5A7AA8',
  '#7B80A0',
  '#C49A8A',
  '#EEF0F8',
  '#2A1A1A',
];

/**
 * 3자리 hex 변형 (S11/S12/S13 에 없으나 향후 회귀 방지용 — plan §4.5).
 */
const PROCESSED_HEX_3DIGIT = ['#fff', '#FFF', '#000'];

/**
 * task 06 보류 hex (negative — 잔존 허용. task 09 위임).
 * plan §3.2.3 결정 B 옵션.
 * 선언은 문서화 목적 (describe 2 에서 직접 리터럴 사용).
 */
// const DEFERRED_HEX_LITERALS = ['#FF6B6B', '#5A8A6A'];

/**
 * 신규 토큰 참조 ≥1 회 (positive).
 * plan §3.2.1 + §3.2.2 매핑 결과.
 */
const NEW_TOKEN_REFS = [
  'colors.bgPrimary',
  'colors.bgDeep',
  'colors.surface',
  'colors.surfaceHigh',
  'colors.border',
  'colors.accentPrimary',
  'colors.textSecondary',
  'colors.accentSecondary',
  'colors.textPrimary',
  'colors.destructiveBg',
];

// ─── describe 1: 처리 hex 잔존 0 ──────────────────────────────────────────────

describe('task 06 m1b-play-pending-nav — 처리 hex 잔존 0', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 처리 hex 10종 + 3자리 변형 0건`, () => {
      const abs = path.join(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of PROCESSED_HEX_LITERALS) {
        // ' 또는 " 로 wrap 된 문자열 리터럴 한정 (주석 안 # 제외)
        const re = new RegExp(`['"]${hex}['"]`, 'g');
        const matches = src.match(re);
        // engineer impl 전: hex 리터럴 잔존 → matches 존재 → RED
        // engineer impl 후: token 치환 완료 → matches null → GREEN
        expect(matches).toBeNull();
      }
      // 3자리 hex 도 동일 (S13 등에 '#fff' 형태 변형 방지)
      for (const hex of PROCESSED_HEX_3DIGIT) {
        const re = new RegExp(`['"]${hex}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
    });
  }
});

// ─── describe 2: 보류 hex 해소 검증 (task 08 흡수 + task 09 종료) ─────────────
//
// task 06 시점 보류 명시 2종 = '#FF6B6B' (errorText) + '#5A8A6A' (exhaustedText).
// task 08 (shared-components) 가 ColorTokens 에 `errorText` / `successMuted` 토큰 추가하면서
// S11PreviewScreen 의 두 hex 도 동시 흡수. task 09 (Epic 12 마지막) 시점에 이미 0건.

describe('task 06 m1b-play-pending-nav — 보류 hex 해소 검증 (task 08/09 흡수 후)', () => {
  it('S11PreviewScreen 의 #FF6B6B (errorText) — 본 task 시점에 0건 (task 08 흡수)', () => {
    const abs = path.join(SRC_ROOT, 'screens/S11PreviewScreen.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes("'#FF6B6B'")).toBe(false);
  });

  it('S11PreviewScreen 의 #5A8A6A (exhaustedText) — 본 task 시점에 0건 (task 08 흡수)', () => {
    const abs = path.join(SRC_ROOT, 'screens/S11PreviewScreen.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes("'#5A8A6A'")).toBe(false);
  });
});

// ─── describe 3: 신규 토큰 참조 ≥1 ───────────────────────────────────────────

describe('task 06 m1b-play-pending-nav — 신규 토큰 참조 ≥1', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 토큰 참조 ≥1`, () => {
      const abs = path.join(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const found = NEW_TOKEN_REFS.filter((tok) => src.includes(tok));
      // engineer impl 전: token 참조 없음 → found.length === 0 → RED
      // engineer impl 후: colors.<token> ≥1 참조 → found.length ≥ 1 → GREEN
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  }
});

// ─── describe 4: useTheme 도입 확인 ──────────────────────────────────────────

describe('task 06 m1b-play-pending-nav — useTheme 도입 확인', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: useTheme import 또는 호출 ≥1`, () => {
      const abs = path.join(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      // engineer impl 전: useTheme 미채택 → false → RED
      // engineer impl 후: useTheme import + 호출 존재 → true → GREEN
      expect(src.includes('useTheme')).toBe(true);
    });
  }
});
