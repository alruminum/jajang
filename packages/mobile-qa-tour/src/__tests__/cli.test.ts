import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// REQ-015 검증 — CLI smoke (--help, 서브커맨드 등록, stub exit code)
// commander 는 process.exit 을 직접 호출하므로 spy 로 가로챔

describe('REQ-012 / REQ-015 CLI smoke', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    vi.resetModules();
  });

  it('--help → commander 가 exit(0) 호출 + 출력에 "monkey", "tour", "init" 포함', async () => {
    // commander parseAsync 로 --help 시뮬레이션
    const { program } = await import('../cli');
    program.configureOutput({
      writeOut: (str) => { stdoutSpy; void str; },
      writeErr: (str) => { stderrSpy; void str; },
    });

    let helpText = '';
    program.configureOutput({
      writeOut: (str) => { helpText += str; },
      writeErr: (str) => { helpText += str; },
    });

    try {
      await program.parseAsync(['node', 'mobile-qa-tour', '--help']);
    } catch (e: unknown) {
      // process.exit mock 이 throw 하므로 catch
      const msg = (e as Error).message;
      expect(msg).toMatch(/process\.exit\(0\)/);
    }

    expect(helpText).toContain('monkey');
    expect(helpText).toContain('tour');
    expect(helpText).toContain('init');
  });

  it('monkey --help → --package, --events 등 option 목록 노출', async () => {
    const { program } = await import('../cli');

    let helpText = '';
    program.configureOutput({
      writeOut: (str) => { helpText += str; },
      writeErr: (str) => { helpText += str; },
    });

    try {
      await program.parseAsync(['node', 'mobile-qa-tour', 'monkey', '--help']);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/process\.exit\(0\)/);
    }

    expect(helpText).toContain('--package');
    expect(helpText).toContain('--events');
  });

  it('tour --help → --config, --output, --only 등 option 목록 노출 (REQ-011)', async () => {
    const { program } = await import('../cli');

    let helpText = '';
    program.configureOutput({
      writeOut: (str) => { helpText += str; },
      writeErr: (str) => { helpText += str; },
    });

    try {
      await program.parseAsync(['node', 'mobile-qa-tour', 'tour', '--help']);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/process\.exit\(0\)/);
    }

    expect(helpText).toContain('--config');
    expect(helpText).toContain('--output');
    expect(helpText).toContain('--only');
  });

  it('init --help → --out option 노출 (REQ-011)', async () => {
    const { program } = await import('../cli');

    let helpText = '';
    program.configureOutput({
      writeOut: (str) => { helpText += str; },
      writeErr: (str) => { helpText += str; },
    });

    try {
      await program.parseAsync(['node', 'mobile-qa-tour', 'init', '--help']);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/process\.exit\(0\)/);
    }

    expect(helpText).toContain('--out');
  });
});
