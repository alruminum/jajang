import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTour } from '../runner';
import type { TourOptions } from '../runner';
import type { QaConfig } from '../../config/schema';

vi.mock('../entry-steps', () => ({
  executeSteps: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../adb', () => ({
  adbExecOut: vi.fn().mockResolvedValue(Buffer.from('PNG_DATA')),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { executeSteps } from '../entry-steps';
import { adbExecOut } from '../../adb';
import * as fsp from 'node:fs/promises';

const mockExecuteSteps = vi.mocked(executeSteps);
const mockAdbExecOut = vi.mocked(adbExecOut);
const mockMkdir = vi.mocked(fsp.mkdir);
const mockWriteFile = vi.mocked(fsp.writeFile);

function makeConfig(screens: QaConfig['screens']): QaConfig {
  return {
    appPackage: 'com.test.app',
    outputDir: '/qa-output',
    screens,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteSteps.mockResolvedValue(undefined);
  mockAdbExecOut.mockResolvedValue(Buffer.from('PNG_DATA'));
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
});

describe('REQ-007 runTour — N 화면 순회', () => {
  it('2개 화면 config — executeSteps 2회 호출', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Settings', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    expect(mockExecuteSteps).toHaveBeenCalledTimes(2);
  });

  it('2개 화면 config — adbExecOut("screencap -p") 2회 호출', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Settings', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    expect(mockAdbExecOut).toHaveBeenCalledTimes(2);
    expect(mockAdbExecOut).toHaveBeenCalledWith('screencap -p');
  });

  it('2개 화면 config — fs.writeFile 2회 호출 (screenshot 저장)', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Detail', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });
});

// REQ-009: screenshotPath 형식 검증
describe('REQ-009 runTour — screenshotPath 형식', () => {
  it('screenshotPath 가 <output>/<YYYY-MM-DD>-tour/<id>.png 형식', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    const result = await runTour({ config, output: '/custom-output' });
    const { screenshotPath } = result.screens[0];
    expect(screenshotPath).toMatch(/\/custom-output\/\d{4}-\d{2}-\d{2}-tour\/Home\.png$/);
  });

  it('mkdir recursive 로 tourSubdir 생성', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringMatching(/-tour$/), { recursive: true });
  });
});

// REQ-008: --only 필터
describe('REQ-008 runTour — only 옵션', () => {
  it('only="Detail" — executeSteps 1회만 호출 (Detail 화면만)', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Detail', entrySteps: [], settleMs: 0 },
    ]);
    const result = await runTour({ config, only: 'Detail' });
    expect(mockExecuteSteps).toHaveBeenCalledTimes(1);
    expect(result.screens).toHaveLength(1);
    expect(result.screens[0].id).toBe('Detail');
  });

  it('only="Bogus" — 매칭 없으면 throw /matched no screen/', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await expect(runTour({ config, only: 'Bogus' })).rejects.toThrow(/matched no screen/);
  });
});

// 빈 screens 가드
describe('runTour — 빈 screens 가드', () => {
  it('config.screens 가 undefined 이면 throw /screens is empty/', async () => {
    const config: QaConfig = {
      appPackage: 'com.test.app',
      outputDir: '/qa-output',
      screenRegistryPath: './registry.json',
      // screens 미설정
    };
    await expect(runTour({ config })).rejects.toThrow(/screens is empty/);
  });

  it('config.screens 가 빈 배열이면 throw /screens is empty/', async () => {
    const config = makeConfig([]);
    await expect(runTour({ config })).rejects.toThrow(/screens is empty/);
  });
});
