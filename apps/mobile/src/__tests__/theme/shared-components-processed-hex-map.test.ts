/**
 * task 08 shared-components
 *
 * REQ-005: 6 대상 파일 (JustArrivedMasterCard / DeleteTracksSheet / GeneratingFailureView /
 *          GeneratingTimeoutNotice / VolumeSlider / AlbumArtRotating) 에서
 *          본 task 가 토큰화한 hex 14종 + rgba 1종이 *문자열 리터럴* 위치에 0건
 *
 * REQ-006: DeleteTracksSheet 에 신규 토큰 참조
 *          colors.successMuted + colors.errorText ≥1 회
 *
 * REQ-007: PRD 명시 useTheme 채택 10 파일 (이미 hex 0)의
 *          6자리 hex 0 유지 (본 task 회귀 방지)
 *
 * REQ-014: 6 대상 파일 모두 useTheme 채택 — useTheme import ≥1 회
 *
 * task 09 (hex-lint) 도입 전까지의 1차 회귀 방지선.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * 경로 계산:
 *   __dirname = apps/mobile/src/__tests__/theme
 *   MOBILE_ROOT = path.resolve(__dirname, '../../..') = apps/mobile
 *   rel 은 apps/mobile 기준 (src/ prefix 포함)
 */
const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..');

// ────────────────────────────────────────────────
// REQ-005 — 6 대상 파일 (hex 교체 대상)
// ────────────────────────────────────────────────
const TARGET_FILES = [
  'src/components/JustArrivedMasterCard.tsx',
  'src/components/DeleteTracksSheet.tsx',
  'src/components/GeneratingFailureView.tsx',
  'src/components/GeneratingTimeoutNotice.tsx',
  'src/components/VolumeSlider.tsx',
  'src/components/AlbumArtRotating.tsx',
];

// task 08 이 토큰화한 hex 14종 (문자열 리터럴 위치에 0건 강제)
const REPLACED_HEX_LITERALS = [
  '#0D0F1A',  // bgPrimary 1:1
  '#1A1D30',  // surface 1:1
  '#1A1D2E',  // surface 흡수 (1dp)
  '#1E2540',  // surfaceHigh 흡수 (3dp)
  '#21253E',  // surfaceHigh 1:1
  '#2A2E48',  // border 1:1
  '#3A3D58',  // border 흡수 (16dp, LOW 위험)
  '#5A7AA8',  // accentPrimary 1:1
  '#7B80A0',  // textSecondary 1:1
  '#C49A8A',  // accentSecondary 1:1
  '#EEF0F8',  // textPrimary 1:1
  '#5A8A6A',  // successMuted 신규 토큰
  '#FF6B6B',  // errorText 신규 토큰
  '#E0B070',  // warning 신규 토큰
];

// rgba 1종 — DeleteTracksSheet backdrop overlay 흡수
const REPLACED_RGBA = 'rgba(0, 0, 0, 0.5)';

// ────────────────────────────────────────────────
// REQ-005 — 6 대상 파일 hex 잔존 0
// ────────────────────────────────────────────────
describe('task 08 shared-components — 6 대상 파일 hex 잔존 0 (REQ-005)', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: 처리 hex 14종 + rgba 0건 (문자열 리터럴)`, () => {
      const abs = path.resolve(MOBILE_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      for (const hex of REPLACED_HEX_LITERALS) {
        const re = new RegExp(`['"]${hex}['"]`, 'gi');
        const matches = src.match(re);
        if (matches !== null) {
          throw new Error(
            `${rel}: ${hex} 잔존 ${matches.length}건 — engineer 가 교체 누락`,
          );
        }
        expect(matches).toBeNull();
      }
      expect(src.includes(`'${REPLACED_RGBA}'`)).toBe(false);
      expect(src.includes(`"${REPLACED_RGBA}"`)).toBe(false);
    });
  }
});

// ────────────────────────────────────────────────
// REQ-006 — DeleteTracksSheet 신규 토큰 참조 검증
// successMuted + errorText ≥1 회
// ────────────────────────────────────────────────
describe('task 08 shared-components — DeleteTracksSheet 신규 토큰 참조 검증 (REQ-006)', () => {
  it('DeleteTracksSheet: colors.successMuted 참조 ≥1 회', () => {
    const abs = path.resolve(MOBILE_ROOT, 'src/components/DeleteTracksSheet.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes('colors.successMuted')).toBe(true);
  });

  it('DeleteTracksSheet: colors.errorText 참조 ≥1 회', () => {
    const abs = path.resolve(MOBILE_ROOT, 'src/components/DeleteTracksSheet.tsx');
    const src = fs.readFileSync(abs, 'utf-8');
    expect(src.includes('colors.errorText')).toBe(true);
  });
});

// ────────────────────────────────────────────────
// REQ-007 — PRD 명시 useTheme 채택 10 파일 hex 0 유지 (회귀 방지)
// 이미 hex 0 인 파일 — 본 task 변경 X, 회귀만 감시
// ────────────────────────────────────────────────
describe('task 08 shared-components — PRD 명시 useTheme 채택 10 파일 hex 0 유지 (REQ-007)', () => {
  const UNCHANGED_FILES = [
    'src/components/CompletedTrackCard.tsx',
    'src/components/MasterAudioCard.tsx',
    'src/components/EmptyMastersState.tsx',
    'src/components/SongListItem.tsx',
    'src/components/TrackCard.tsx',
    'src/components/MiniPlayer.tsx',
    'src/components/TimerBottomSheet.tsx',
    'src/components/TrialBadge.tsx',
    'src/components/TrialExpiryBanner.tsx',
    'src/components/EmptyTrackState.tsx',
  ];
  for (const rel of UNCHANGED_FILES) {
    it(`${rel}: 6자리 hex 잔존 0 (회귀 방지)`, () => {
      const abs = path.resolve(MOBILE_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      const matches = src.match(/['"]#[0-9A-Fa-f]{6}['"]/g);
      expect(matches).toBeNull();
    });
  }
});

// ────────────────────────────────────────────────
// REQ-014 — 6 대상 파일 모두 useTheme 채택 확인
// useTheme import ≥1 회
// ────────────────────────────────────────────────
describe('task 08 shared-components — 6 대상 파일 useTheme 채택 (REQ-014)', () => {
  for (const rel of TARGET_FILES) {
    it(`${rel}: useTheme import 또는 호출 ≥1 회`, () => {
      const abs = path.resolve(MOBILE_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf-8');
      expect(src.includes('useTheme')).toBe(true);
    });
  }
});
