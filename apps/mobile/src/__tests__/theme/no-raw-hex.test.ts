/**
 * task 09 — Jest hex-lint 회귀 방지 인프라
 * task 10 — RecordModeScreen 폐기 + backtick hex 검출 보강
 *
 * 대상: apps/mobile/src/ 전체 (.ts/.tsx)
 * 패턴: /[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g (quote/backtick-aware — 직접 hex *리터럴* 만 검출.
 *       3~6자리 강제: 8자리 #RRGGBBAA 제외.
 *       주석 안 `// (#222)` 같은 이슈 번호 텍스트는 quote 부재 → 자연 제외)
 * 예외 (절대 경로 기준):
 *   - apps/mobile/src/theme/tokens.ts          (SSOT — hex 정의 본체)
 *   - **\/__tests__\/**                          (테스트 파일 자체)
 *   - **\/__mocks__\/**                          (mock 파일)
 *   - *.test.ts / *.test.tsx / *.spec.ts / *.spec.tsx
 *   - 본 테스트 파일 자체 (자동 — __tests__ 안)
 *
 * 실패 시 출력: 파일 상대 경로:라인 + 발견 hex.
 *
 * 도입 시점: task 09 (Epic 12 마지막 task). 본 테스트 머지 시점에 GREEN 보장 → 이후 미래 PR
 * 누군가 src/ 안에 hex 리터럴 추가 시 즉시 RED.
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── 경로 설정 ────────────────────────────────────────────────────────────────

/**
 * __dirname = .../apps/mobile/src/__tests__/theme/
 * SRC_ROOT  = .../apps/mobile/src/
 */
const SRC_ROOT = path.resolve(__dirname, '..', '..');

/**
 * hex 검출 정규식 — quote/backtick 강제. 직접 hex *리터럴* (예: `'#FF4444'` / `"#fff"` / `` `#fff` ``) 만 검출.
 * 주석 안 텍스트 (예: `// TODO(#222)` / `// (#129).`) 는 quote 부재 → 자연 제외.
 * 3~6자리 강제: 8자리 alpha hex (`'#000000AA'`) = 양쪽 quote 사이 글자수 8 → regex `{3,6}` 범위 외 자연 제외.
 */
const HEX_REGEX = /[`'"]#[0-9A-Fa-f]{3,6}[`'"]/g;

/** 파일 단위 예외 — SSOT 본체. 상대 경로 (SRC_ROOT 기준). */
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

/** content 안 hex match + 라인 번호 추출. match 결과는 양쪽 quote/backtick 포함 → slice(1,-1) 로 제거해 hex 만 노출. */
function findHexMatches(content: string): Array<{ line: number; hex: string }> {
  const lines = content.split('\n');
  const matches: Array<{ line: number; hex: string }> = [];
  lines.forEach((lineText, idx) => {
    const found = lineText.match(HEX_REGEX);
    if (found) {
      found.forEach((quoted) => {
        const hex = quoted.slice(1, -1);
        matches.push({ line: idx + 1, hex });
      });
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

  it('ALLOWED_FILES 의 tokens.ts 는 실제 hex 리터럴 정의를 포함한다 (regex 동작 확인)', () => {
    const content = fs.readFileSync(
      path.join(SRC_ROOT, 'theme/tokens.ts'),
      'utf-8',
    );
    const matches = content.match(HEX_REGEX);
    // tokens.ts = hex SSOT → quote 안 hex 리터럴 다수.
    // 8자리 alpha hex (`'#000000AA'`) 는 quote 사이 글자수 8 → regex `{3,6}` 범위 외 자연 제외.
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThan(0);
  });

  it('예외 등재 함수 isAllowed — 등재 파일 / 디렉토리 prefix / 테스트 suffix 모두 통과', () => {
    expect(isAllowed('theme/tokens.ts')).toBe(true);
    // REQ-004: task 10 에서 ALLOWED_FILES 제거됨 — RecordModeScreen 은 예외 아님
    expect(isAllowed('screens/RecordModeScreen.tsx')).toBe(false);
    expect(isAllowed('__tests__/theme/no-raw-hex.test.ts')).toBe(true);
    expect(isAllowed('__mocks__/Foo.ts')).toBe(true); // __mocks__/ prefix 매치
    expect(isAllowed('components/Foo.test.tsx')).toBe(true);
    expect(isAllowed('components/Foo.spec.ts')).toBe(true);
    expect(isAllowed('screens/RecordScreen.tsx')).toBe(false);
  });

  it('quote-aware regex — 주석 안 hex 형태 텍스트는 검출 X', () => {
    expect('// TODO(#222): loop'.match(HEX_REGEX)).toBeNull();
    expect('// useFocusEffect (#129).'.match(HEX_REGEX)).toBeNull();
    expect("color: '#FF4444'".match(HEX_REGEX)).not.toBeNull();
    expect('color: "#fff"'.match(HEX_REGEX)).not.toBeNull();
  });

  // REQ-005: backtick hex 리터럴 검출 — task 10 HEX_REGEX 보강 후 GREEN
  it('backtick hex 리터럴 검출 — `#RRGGBB` 패턴 매치', () => {
    expect('`#FF4444`'.match(HEX_REGEX)).not.toBeNull();
    expect('`#fff`'.match(HEX_REGEX)).not.toBeNull();
    // 변수 주입 패턴은 backtick 직후가 # 아님 → 검출 X
    expect('`${color}`'.match(HEX_REGEX)).toBeNull();
  });
});
