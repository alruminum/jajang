/**
 * REQ-001 / REQ-002 — M0 인증·온보딩 8 파일 hex 잔존 없음 + useTheme 호출 검증
 *
 * 수용 기준:
 * - REQ-001: 대상 8 파일 모두 `useTheme(` 호출 1회 이상 포함
 * - REQ-002: 대상 8 파일 내 6자리 hex 리터럴(`#[0-9A-Fa-f]{6}`) 0건
 *
 * 대상 파일 (impl §2 표 그대로):
 *   S01SplashScreen, S02PrivacyScreen, S03OnboardingScreen, S04SignupScreen,
 *   S05LoginScreen, LegalScreen (screens/), SocialAuthButtons (components/),
 *   AuthNavigator (navigation/)
 *
 * 구현 방식:
 * - Jest 환경에서 Node.js `fs.readFileSync` 로 파일 내용 읽기 (React Native 렌더 불필요)
 * - 정규식: 6자리 hex = `/#[0-9A-Fa-f]{6}\b/g`
 *   (\b: word boundary → 8자리 hex '#0D0F1A00' 이 6자리로 오인식되는 오검출 방지)
 * - useTheme 호출 = `useTheme(` 문자열 포함 여부 (최소 1회)
 *
 * 현재 상태 (engineer impl 전):
 * - REQ-001: 8 파일 모두 useTheme 미채택 → 8건 FAIL → RED
 * - REQ-002: 총 73건 hex 잔존 → RED
 *
 * engineer impl 후:
 * - REQ-001: 8 파일 모두 useTheme( 포함 → GREEN
 * - REQ-002: 0건 → GREEN
 *
 * 주의: 8자리 hex(투명도 포함, 예: '#5A7AA824')는 대상 외 — \b word boundary 로 자연 제외.
 * 예외 목록(ALLOWED_HEX): 예외 없음 (impl §6.2 확인 — 8 파일 내 예외 hex 0건).
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── 대상 파일 경로 설정 ──────────────────────────────────────────────────────

/**
 * 테스트 파일 위치: apps/mobile/src/__tests__/theme/
 * 대상 파일 위치: apps/mobile/src/screens/, apps/mobile/src/components/, apps/mobile/src/navigation/
 * 상대 경로 기준: __dirname 에서 ../../.. = apps/mobile/src
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

const TARGET_FILES: Array<{ label: string; relativePath: string }> = [
  {
    label: 'S01SplashScreen',
    relativePath: 'screens/S01SplashScreen.tsx',
  },
  {
    label: 'S02PrivacyScreen',
    relativePath: 'screens/S02PrivacyScreen.tsx',
  },
  {
    label: 'S03OnboardingScreen',
    relativePath: 'screens/S03OnboardingScreen.tsx',
  },
  {
    label: 'S04SignupScreen',
    relativePath: 'screens/S04SignupScreen.tsx',
  },
  {
    label: 'S05LoginScreen',
    relativePath: 'screens/S05LoginScreen.tsx',
  },
  {
    label: 'LegalScreen',
    relativePath: 'screens/LegalScreen.tsx',
  },
  {
    label: 'SocialAuthButtons',
    relativePath: 'components/SocialAuthButtons.tsx',
  },
  {
    label: 'AuthNavigator',
    relativePath: 'navigation/AuthNavigator.tsx',
  },
];

// ─── Regex 정의 ───────────────────────────────────────────────────────────────

/**
 * 6자리 hex 리터럴 검출 정규식.
 * \b (word boundary): 뒤에 hex 문자가 이어지면 매칭 안 됨 → 8자리 hex 오검출 방지.
 * 예: '#1A1D30' → 매칭, '#5A7AA824' → 매칭 안 됨 (8자리, 뒤에 '24' 이어짐).
 */
const HEX_6_REGEX = /#[0-9A-Fa-f]{6}\b/g;

/** useTheme 호출 검출 문자열 */
const USE_THEME_CALL = 'useTheme(';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function readFile(relativePath: string): string {
  const absolutePath = path.join(SRC_ROOT, relativePath);
  return fs.readFileSync(absolutePath, 'utf-8');
}

function findHex6Matches(content: string): string[] {
  return content.match(HEX_6_REGEX) ?? [];
}

function hasUseThemeCall(content: string): boolean {
  return content.includes(USE_THEME_CALL);
}

// ─── REQ-001: useTheme 호출 존재 검증 ────────────────────────────────────────

describe('REQ-001 — 대상 8 파일 useTheme() 호출 검증', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 useTheme( 호출이 1회 이상 포함된다`, () => {
      const content = readFile(relativePath);
      // engineer impl 전: useTheme 미채택 → false → RED
      // engineer impl 후: useTheme( 포함 → true → GREEN
      expect(hasUseThemeCall(content)).toBe(true);
    });
  }
});

// ─── REQ-002: 6자리 hex 잔존 0건 검증 ────────────────────────────────────────

describe('REQ-002 — 대상 8 파일 6자리 hex 리터럴 0건 검증', () => {
  for (const { label, relativePath } of TARGET_FILES) {
    it(`${label} 에 6자리 hex 리터럴이 없다 (0건)`, () => {
      const content = readFile(relativePath);
      const matches = findHex6Matches(content);
      // engineer impl 전: hex 잔존 → matches.length > 0 → RED
      // engineer impl 후: 모든 hex → token 변환 → matches.length === 0 → GREEN
      //
      // 실패 시 잔존 hex 목록을 메시지에 포함해 디버깅 용이하게 함
      expect(matches).toEqual([]);
    });
  }
});

// ─── 통합: 8 파일 전수 요약 ───────────────────────────────────────────────────

describe('REQ-001+002 통합 — 8 파일 전수 hex 총합 및 useTheme 채택 수', () => {
  it('8 파일 전체에서 6자리 hex 총합이 0건이다', () => {
    const allMatches: Array<{ file: string; hex: string }> = [];
    for (const { label, relativePath } of TARGET_FILES) {
      const content = readFile(relativePath);
      const matches = findHex6Matches(content);
      matches.forEach((hex) => allMatches.push({ file: label, hex }));
    }
    // 실패 시 잔존 파일+hex 목록 노출
    expect(allMatches).toEqual([]);
  });

  it('8 파일 모두 useTheme( 를 포함한다 (8/8 채택)', () => {
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
