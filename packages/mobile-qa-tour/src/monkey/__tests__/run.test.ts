import { describe, it, expect, vi, beforeEach } from 'vitest';

// REQ-008, REQ-009 검증 — execa + fs mock
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

import { execa } from 'execa';
import { promises as fs } from 'node:fs';
import { runMonkey } from '../run';
import type { MonkeyOptions } from '../run';

const mockExeca = vi.mocked(execa);
const mockFs = {
  mkdir: vi.mocked(fs.mkdir),
  writeFile: vi.mocked(fs.writeFile),
};

const defaultOpts: MonkeyOptions = {
  appPackage: 'com.example.app',
  events: 100,
  throttle: 200,
  pcts: { touch: 60, motion: 20, nav: 10, syskeys: 5, anyevent: 5 },
  output: '/tmp/qa-output',
};

describe('REQ-008 runMonkey — device 없을 때 에러 throw', () => {
  beforeEach(() => {
    mockExeca.mockReset();
    mockFs.mkdir.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  it('adb devices 결과가 0대 → "No adb device" 에러 throw (REQ-008)', async () => {
    // listDevices() 가 내부적으로 execa('adb', ['devices']) 를 호출
    mockExeca.mockResolvedValueOnce({ stdout: 'List of devices attached\n' } as any);

    await expect(runMonkey(defaultOpts)).rejects.toThrow(/No adb device/);
  });
});

describe('REQ-009 runMonkey — 정상 흐름 adb 호출 순서 검증', () => {
  beforeEach(() => {
    mockExeca.mockReset();
    mockFs.mkdir.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
  });

  function setupNormalFlow() {
    // call 0: listDevices → adb devices
    mockExeca.mockResolvedValueOnce({ stdout: 'List of devices attached\nemulator-5554\tdevice\n' } as any);
    // call 1: logcat -c (clear)
    mockExeca.mockResolvedValueOnce({ stdout: '' } as any);
    // call 2: monkey shell (adb shell monkey ...)
    mockExeca.mockResolvedValueOnce({ stdout: 'Events injected: 100', exitCode: 0 } as any);
    // call 3: logcat -d
    mockExeca.mockResolvedValueOnce({ stdout: '' } as any);
    // call 4: screencap (adbExecOut)
    mockExeca.mockResolvedValueOnce({ stdout: Buffer.from('PNG') } as any);
  }

  it('정상 흐름 → execa 호출 순서: devices → logcat-c → monkey → logcat-d → screencap (REQ-009)', async () => {
    setupNormalFlow();

    await runMonkey(defaultOpts);

    const calls = mockExeca.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(5);

    // call 0: adb devices
    expect(calls[0][0]).toBe('adb');
    expect(calls[0][1]).toContain('devices');

    // call 1: logcat -c
    expect(calls[1][1]).toContain('logcat');
    expect(calls[1][1]).toContain('-c');

    // call 2: adb shell monkey
    expect(calls[2][1]).toContain('shell');
    expect(calls[2][1]).toContain('monkey');

    // call 3: logcat -d
    expect(calls[3][1]).toContain('logcat');
    expect(calls[3][1]).toContain('-d');

    // call 4: screencap
    expect(calls[4][1]).toContain('screencap');
  });

  it('정상 흐름 → MonkeyResult 가 appPackage / events / crashes 필드를 포함', async () => {
    setupNormalFlow();

    const result = await runMonkey(defaultOpts);

    expect(result.appPackage).toBe('com.example.app');
    expect(result.events).toBe(100);
    expect(Array.isArray(result.crashes)).toBe(true);
  });

  it('seed 지정 시 monkey args 에 -s <seed> 포함 (REQ-009 확장)', async () => {
    setupNormalFlow();

    await runMonkey({ ...defaultOpts, seed: 12345 });

    const monkeyCall = mockExeca.mock.calls[2];
    const args = monkeyCall[1] as string[];
    const seedIdx = args.indexOf('-s');
    expect(seedIdx).toBeGreaterThanOrEqual(0);
    expect(args[seedIdx + 1]).toBe('12345');
  });

  it('screencap 실패 시 screenshotPath: null 반환 + console.warn 호출', async () => {
    // listDevices
    mockExeca.mockResolvedValueOnce({ stdout: 'List of devices attached\nemulator-5554\tdevice\n' } as any);
    // logcat -c
    mockExeca.mockResolvedValueOnce({ stdout: '' } as any);
    // monkey shell
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any);
    // logcat -d
    mockExeca.mockResolvedValueOnce({ stdout: '' } as any);
    // screencap → 실패
    mockExeca.mockRejectedValueOnce(new Error('screencap: command not found'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runMonkey(defaultOpts);

    expect(result.screenshotPath).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('logcat 에 FATAL EXCEPTION 있을 때 result.crashes.length > 0', async () => {
    const logcatWithCrash = 'I/OK: line\nFATAL EXCEPTION: main\n  at com.example\nend';

    // listDevices
    mockExeca.mockResolvedValueOnce({ stdout: 'List of devices attached\nemulator-5554\tdevice\n' } as any);
    // logcat -c
    mockExeca.mockResolvedValueOnce({ stdout: '' } as any);
    // monkey
    mockExeca.mockResolvedValueOnce({ stdout: '', exitCode: 1 } as any);
    // logcat -d (contains crash)
    mockExeca.mockResolvedValueOnce({ stdout: logcatWithCrash } as any);
    // screencap
    mockExeca.mockResolvedValueOnce({ stdout: Buffer.from('PNG') } as any);

    const result = await runMonkey(defaultOpts);

    expect(result.crashes.length).toBeGreaterThan(0);
    expect(result.crashes[0].type).toBe('FATAL');
  });
});
