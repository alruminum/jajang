import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInit } from '../init';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
  copyFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fsp from 'node:fs/promises';

const mockMkdir = vi.mocked(fsp.mkdir);
const mockStat = vi.mocked(fsp.stat);
const mockCopyFile = vi.mocked(fsp.copyFile);

const ENOENT = Object.assign(new Error('no such file'), { code: 'ENOENT' });

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockCopyFile.mockResolvedValue(undefined);
});

describe('REQ-010 runInit — 템플릿 복사 / 기존 파일 skip', () => {
  it('두 파일 모두 없으면 copyFile 2회, copied.length=2, skipped.length=0', async () => {
    mockStat.mockRejectedValue(ENOENT);

    const result = await runInit({ outDir: '/target' });

    expect(mockCopyFile).toHaveBeenCalledTimes(2);
    expect(result.copied).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('qa.config.example.json 이미 존재 → copyFile 1회 (registry 만), skipped.length=1', async () => {
    mockStat
      .mockResolvedValueOnce({} as any)  // qa.config.example.json 존재
      .mockRejectedValueOnce(ENOENT);    // screen-registry.example.json 없음

    const result = await runInit({ outDir: '/target' });

    expect(mockCopyFile).toHaveBeenCalledTimes(1);
    expect(result.copied).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
  });

  it('두 파일 모두 이미 존재 → copyFile 0회, skipped.length=2', async () => {
    mockStat.mockResolvedValue({} as any);

    const result = await runInit({ outDir: '/target' });

    expect(mockCopyFile).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(2);
    expect(result.copied).toHaveLength(0);
  });

  it('outDir mkdir recursive 호출 확인', async () => {
    mockStat.mockRejectedValue(ENOENT);

    await runInit({ outDir: '/new/target' });

    expect(mockMkdir).toHaveBeenCalledWith('/new/target', { recursive: true });
  });

  it('copied 배열의 경로가 outDir 하위 절대경로', async () => {
    mockStat.mockRejectedValue(ENOENT);

    const result = await runInit({ outDir: '/target' });

    for (const p of result.copied) {
      expect(p).toMatch(/^\/target\//);
    }
  });

  it('skipped 배열의 경로가 outDir 하위 절대경로', async () => {
    mockStat.mockResolvedValue({} as any);

    const result = await runInit({ outDir: '/target' });

    for (const p of result.skipped) {
      expect(p).toMatch(/^\/target\//);
    }
  });
});
