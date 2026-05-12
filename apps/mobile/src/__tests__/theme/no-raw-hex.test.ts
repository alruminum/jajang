/**
 * task 09 — Jest hex-lint 회귀 방지 인프라
 *
 * 대상: apps/mobile/src/ 전체 (.ts/.tsx)
 * 패턴: /#[0-9A-Fa-f]{3,6}\b/g (3자리 + 6자리 hex; \b 로 8자리 alpha hex 자연 제외)
 * 예외 (절대 경로 기준):
 *   - apps/mobile/src/theme/tokens.ts  (SSOT — hex 정의 본체)
 *   - **\/__tests__\/**                  (테스트 파일 자체)
 *   - **\/__mocks__\/**                  (mock 파일)
 *   - *.test.ts / *.test.tsx / *.spec.ts / *.spec.tsx
 *   - 본 테스트 파일 자체 (자동 — __tests__ 안)
 *
 * 실패 시 출력: 파일 상대 경로:라인 + 발견 hex (가까운 토큰 제안 = 별도 옵션, MVP 미포함)
 *
 * 도입 시점: task 09 (Epic 12 마지막 task). 본 테스트 머지 시점에 GREEN 보장 → 이후 미래 PR
 * 누군가 src/ 안에 hex 추가 시 즉시 RED.
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── 경로 설정 ────────────────────────────────────────────────────────────────

/**
 * __dirname = .../apps/mobile/src/__tests__/theme/
 * SRC_ROOT  = .../apps/mobile/src/
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

/** hex 검출 정규식 — 3 또는 6 자리. \b word boundary 로 8자리 (alpha 포함) 자연 제외. */
const HEX_REGEX = /#[0-9A-Fa-f]{3,6}\b/g;

/** 파일 단위 예외 — SSOT 본체 + 본 테스트. 상대 경로 (SRC_ROOT 기준). */
const ALLOWED_FILES: string[] = [
  'theme/tokens.ts',
];

/** 디렉토리 단위 예외 — 테스트 + mock. (SRC_ROOT 기준 prefix) */
const ALLOWED_DIR_PREFIXES: string[] = [
  '__tests__/',
  '__mocks__/',
];

/** 파일 suffix 예외 — *.test.* / *.spec.* */
const ALLOWED_SUFFIXES: RegExp[] = [
  /\.test\.ts$/,
  /\.test\.tsx$/,
  /\.spec\.ts$/,
  /\.spec\.tsx$/,
];

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** SRC_ROOT 하위 .ts/.tsx 파일 재귀 수집 (상대 경로 반환). */
function collectSourceFiles(absDir: string, relPrefix: string = ''): string[] {
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const results: string[] = [];
  for (const ent of entries) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const abs = path.join(absDir, ent.name);
    if (ent.isDirectory()) {
      results.push(...collectSourceFiles(abs, rel));
    } else if (ent.isFile() && /\.(ts|tsx)$/.test(ent.name)) {
      results.push(rel);
    }
  }
  return results;
}

/** 예외 등재 여부. */
function isAllowed(relPath: string): boolean {
  if (ALLOWED_FILES.includes(relPath)) return true;
  if (ALLOWED_DIR_PREFIXES.some((p) => relPath.startsWith(p))) return true;
  if (ALLOWED_SUFFIXES.some((re) => re.test(relPath))) return true;
  return false;
}

/** content 안 hex match + 라인 번호 추출. */
function findHexMatches(content: string): Array<{ line: number; hex: string }> {
  const lines = content.split('\n');
  const matches: Array<{ line: number; hex: string }> = [];
  lines.forEach((lineText, idx) => {
    const found = lineText.match(HEX_REGEX);
    if (found) {
      found.forEach((hex) => matches.push({ line: idx + 1, hex }));
    }
  });
  return matches;
}

// ─── 테스트 본문 ──────────────────────────────────────────────────────────────

describe('task 09 — no-raw-hex (apps/mobile/src/ 전체 hex 0)', () => {
  it('src/ 하위 .ts/.tsx 파일에 직접 hex 리터럴 0건 (예외 등재 분 제외)', () => {
    const allFiles = collectSourceFiles(SRC_ROOT);
    const violations: Array<{ file: string; line: number; hex: string }> = [];

    for (const rel of allFiles) {
      if (isAllowed(rel)) continue;
      const abs = path.join(SRC_ROOT, rel);
      const content = fs.readFileSync(abs, 'utf-8');
      const matches = findHexMatches(content);
      for (const m of matches) {
        violations.push({ file: rel, line: m.line, hex: m.hex });
      }
    }

    // 실패 시 위반 목록을 가독성 있는 메시지로 출력
    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.hex}`)
        .join('\n');
      throw new Error(
        `[task 09 hex-lint] ${violations.length} 위반 발견:\n${msg}\n\n` +
          `→ src/theme/tokens.ts 에 정의된 토큰 사용 또는 신규 토큰 추가 후 토큰 참조로 교체.`,
      );
    }

    expect(violations).toEqual([]);
  });
});

// ─── 자가 검증 (테스트 메타) ───────────────────────────────────────────────────

describe('task 09 — no-raw-hex 인프라 자가 검증', () => {
  it('SRC_ROOT 가 apps/mobile/src 절대 경로로 해석된다', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'theme/tokens.ts'))).toBe(true);
  });

  it('ALLOWED_FILES 의 tokens.ts 는 실제 hex 정의를 포함한다 (regex 동작 확인)', () => {
    const content = fs.readFileSync(
      path.join(SRC_ROOT, 'theme/tokens.ts'),
      'utf-8',
    );
    const matches = content.match(HEX_REGEX);
    // tokens.ts = hex SSOT → 최소 15+9+3+2 = 29 토큰 × 2 (dark/light) ≈ 58 hex (3자리·6자리 합산).
    // 단 8자리 (`#000000AA` 등) 는 \b 로 자연 제외 → 6자리 hex 카운트 < 전체. 정확 카운트 X — 0보다 큰지만 확인.
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThan(0);
  });

  it('예외 등재 함수 isAllowed — tokens.ts / __tests__ / __mocks__ / *.test.* 통과', () => {
    expect(isAllowed('theme/tokens.ts')).toBe(true);
    expect(isAllowed('__tests__/theme/no-raw-hex.test.ts')).toBe(true);
    expect(isAllowed('__mocks__/react-native-track-player.js')).toBe(false); // .js 확장자 → 수집 대상 외
    expect(isAllowed('components/Foo.test.tsx')).toBe(true);
    expect(isAllowed('components/Foo.spec.ts')).toBe(true);
    expect(isAllowed('screens/RecordScreen.tsx')).toBe(false);
  });
});
