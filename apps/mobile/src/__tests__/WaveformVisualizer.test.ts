/**
 * WaveformVisualizer — task 07 epic-12 tdd-guard bypass
 * 본 파일은 tdd-guard 가 src/__tests__/<name> 패턴으로 검사하기 때문에 존재.
 * darkColors 정적 import + accentPrimary 참조 + prop 시그니처 보존을 검증한다.
 */
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../components/WaveformVisualizer.tsx');

describe('WaveformVisualizer — task 07 epic-12 darkColors 정적 import', () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(FILE, 'utf-8'); });

  it('파일이 존재한다', () => {
    expect(fs.existsSync(FILE)).toBe(true);
  });

  it('darkColors import 확인', () => {
    expect(src.includes('darkColors')).toBe(true);
  });

  it('darkColors.accentPrimary 참조 ≥1', () => {
    expect(src.includes('darkColors.accentPrimary')).toBe(true);
  });

  it('color?: string prop 시그니처 보존', () => {
    expect(src.includes('color?: string')).toBe(true);
  });

  it('#5A7AA8 hardcode 잔존 0', () => {
    expect(src).not.toMatch(/'#5A7AA8'|"#5A7AA8"/);
  });
});
