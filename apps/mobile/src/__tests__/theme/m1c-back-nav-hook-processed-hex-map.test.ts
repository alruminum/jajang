/**
 * task 07 m1c-back-nav-hook
 *
 * 본 task 3 대상 파일 (useBackNavigation/LyricsBox/WaveformVisualizer) 에서:
 * (1) 본 task 가 토큰화한 6 hex (기존 토큰 1:1) + 1 hex (surfaceHigh 흡수) + rgba (overlay 흡수)
 *     가 *factory 본문 외부 또는 인라인* 위치에 0건
 * (2) useTheme import + 호출 ≥1 회 (useBackNavigation/LyricsBox 2 파일만 — WaveformVisualizer 는
 *     정적 darkColors import 만 + useTheme 미채택. system-design §3.4 결정)
 * (3) WaveformVisualizer = darkColors import + accentPrimary 참조 ≥1 회 (positive)
 *
 * 본 task 보류 hex = 0 (§3.2.3). negative assertion 0.
 *
 * task 09 (hex-lint 회귀 테스트) 도입 전까지의 1차 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * 경로 계산:
 *   __dirname = apps/mobile/src/__tests__/theme
 *   SRC_ROOT  = path.resolve(__dirname, '..', '..') = apps/mobile/src
 *   아래 경로는 SRC_ROOT 기준 (src/ prefix 없음)
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FILES_WITH_USETHEME = [
  'hooks/useBackNavigation.tsx',
  'components/LyricsBox.tsx',
];
const TARGET_FILE_DARKCOLORS_STATIC = 'components/WaveformVisualizer.tsx';

// task 07 가 토큰화한 hex (positive — 0건 강제)
const PROCESSED_HEX_LITERALS = [
  '#0D0F1A', '#1A1D30', '#1E2140', '#2A2E48',
  '#5A7AA8', '#7B80A0', '#EEF0F8',
];

// rgba 도 동일 — useBackNavigation L125 흡수 대상
const PROCESSED_RGBA = 'rgba(0, 0, 0, 0.6)';

// 신규 토큰 참조 ≥1 회 (positive — useTheme 사용 2 파일)
const NEW_TOKEN_REFS = [
  'colors.bgPrimary', 'colors.surface', 'colors.surfaceHigh',
  'colors.border', 'colors.accentPrimary', 'colors.textPrimary',
  'colors.textSecondary', 'colors.overlay',
];

describe('task 07 m1c-back-nav-hook — 처리 hex 잔존 0 (useTheme 2 파일)', () => {
  for (const rel of TARGET_FILES_WITH_USETHEME) {
    it(`${rel}: 처리 hex 7종 + rgba 0건`, () => {
      const abs = path.resolve(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of PROCESSED_HEX_LITERALS) {
        const re = new RegExp(`['"]${hex}['"]`, 'g');
        const matches = src.match(re);
        expect(matches).toBeNull();
      }
      expect(src.includes(`'${PROCESSED_RGBA}'`)).toBe(false);
      expect(src.includes(`"${PROCESSED_RGBA}"`)).toBe(false);
    });
  }
});

describe('task 07 m1c-back-nav-hook — 신규 토큰 참조 ≥1 (useTheme 2 파일)', () => {
  for (const rel of TARGET_FILES_WITH_USETHEME) {
    it(`${rel}: 토큰 참조 ≥1`, () => {
      const abs = path.resolve(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const found = NEW_TOKEN_REFS.filter((tok) => src.includes(tok));
      expect(found.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe('task 07 m1c-back-nav-hook — useTheme 도입 확인 (2 파일)', () => {
  for (const rel of TARGET_FILES_WITH_USETHEME) {
    it(`${rel}: useTheme import 또는 호출 ≥1`, () => {
      const abs = path.resolve(SRC_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      expect(src.includes('useTheme')).toBe(true);
    });
  }
});

describe('task 07 m1c-back-nav-hook — WaveformVisualizer 정적 darkColors 채택', () => {
  it('WaveformVisualizer.tsx: 처리 hex 7종 + 3자리 변형 0건', () => {
    const abs = path.resolve(SRC_ROOT, TARGET_FILE_DARKCOLORS_STATIC);
    const src = fs.readFileSync(abs, 'utf-8');
    for (const hex of PROCESSED_HEX_LITERALS) {
      const re = new RegExp(`['"]${hex}['"]`, 'g');
      const matches = src.match(re);
      expect(matches).toBeNull();
    }
  });
  it('WaveformVisualizer.tsx: darkColors import + accentPrimary 참조 ≥1', () => {
    const abs = path.resolve(SRC_ROOT, TARGET_FILE_DARKCOLORS_STATIC);
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes('darkColors')).toBe(true);
    expect(src.includes('darkColors.accentPrimary')).toBe(true);
  });
  it('WaveformVisualizer.tsx: prop 시그니처 보존 — color?: string 유지', () => {
    const abs = path.resolve(SRC_ROOT, TARGET_FILE_DARKCOLORS_STATIC);
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes('color?: string')).toBe(true);
  });
});
