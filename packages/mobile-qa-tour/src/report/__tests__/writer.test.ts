import { describe, it, expect, afterEach } from 'vitest';
import { writeReport } from '../writer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// REQ-006 검증
describe('REQ-006 writeReport', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    // 생성한 tmpdir 정리
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it('존재하지 않는 디렉토리 자동 생성 후 파일 작성', async () => {
    const outputDir = path.join(os.tmpdir(), `mobile-qa-tour-test-${Date.now()}`, 'nested', 'dir');
    tmpDirs.push(outputDir);
    const content = '# Test Report\n\nSome content.';
    const filename = 'test-report.md';

    const resultPath = await writeReport(outputDir, filename, content);

    const written = await fs.readFile(resultPath, 'utf8');
    expect(written).toBe(content);
  });

  it('반환값이 absolute path', async () => {
    const outputDir = path.join(os.tmpdir(), `mobile-qa-tour-abs-${Date.now()}`);
    tmpDirs.push(outputDir);
    const filename = 'abs-test.md';
    const content = 'absolute path check';

    const resultPath = await writeReport(outputDir, filename, content);

    expect(path.isAbsolute(resultPath)).toBe(true);
  });

  it('반환된 경로가 outputDir + filename 을 join 한 값과 일치', async () => {
    const outputDir = path.join(os.tmpdir(), `mobile-qa-tour-join-${Date.now()}`);
    tmpDirs.push(outputDir);
    const filename = '2026-05-01-monkey.md';
    const content = 'join path test';

    const resultPath = await writeReport(outputDir, filename, content);

    expect(resultPath).toBe(path.join(outputDir, filename));
  });

  it('동일 경로에 두 번 writeReport 시 내용 덮어쓰기', async () => {
    const outputDir = path.join(os.tmpdir(), `mobile-qa-tour-overwrite-${Date.now()}`);
    tmpDirs.push(outputDir);
    const filename = 'overwrite-test.md';

    await writeReport(outputDir, filename, 'first content');
    const resultPath = await writeReport(outputDir, filename, 'second content');

    const written = await fs.readFile(resultPath, 'utf8');
    expect(written).toBe('second content');
  });
});
