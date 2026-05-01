import { describe, it, expect, vi, beforeEach } from 'vitest';

// REQ-007 검증 — execa mock 후 인자 sequence 검증
vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import { adbShell, adbExecOut, adbLogcat, listDevices } from '../index';

const mockExeca = vi.mocked(execa);

describe('REQ-007 adb wrapper — execa 인자 검증', () => {
  beforeEach(() => {
    mockExeca.mockReset();
  });

  it('adbShell("ls") → execa("adb", ["shell", "ls"], ...) 호출', async () => {
    mockExeca.mockResolvedValue({ stdout: 'file1\nfile2' } as any);

    await adbShell('ls');

    expect(mockExeca).toHaveBeenCalledOnce();
    const [cmd, args] = mockExeca.mock.calls[0];
    expect(cmd).toBe('adb');
    expect(args).toEqual(['shell', 'ls']);
  });

  it('adbShell 에 serial 옵션 전달 시 → [-s, serial, shell, cmd] prefix', async () => {
    mockExeca.mockResolvedValue({ stdout: '' } as any);

    await adbShell('ls', { serial: 'emulator-5554' });

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toEqual(['-s', 'emulator-5554', 'shell', 'ls']);
  });

  it('adbExecOut("screencap -p") → execa 3번째 인자에 encoding: null 포함', async () => {
    mockExeca.mockResolvedValue({ stdout: Buffer.from('PNG') } as any);

    await adbExecOut('screencap -p');

    expect(mockExeca).toHaveBeenCalledOnce();
    const [cmd, args, options] = mockExeca.mock.calls[0];
    expect(cmd).toBe('adb');
    expect(args).toEqual(['exec-out', 'screencap -p']);
    expect(options).toMatchObject({ encoding: null });
  });

  it('adbLogcat() 기본 → execa("adb", ["logcat", "-d"], ...) 호출', async () => {
    mockExeca.mockResolvedValue({ stdout: 'log output' } as any);

    await adbLogcat();

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toEqual(['logcat', '-d']);
  });

  it('adbLogcat(["-c"]) → execa("adb", ["logcat", "-c"]) 호출', async () => {
    mockExeca.mockResolvedValue({ stdout: '' } as any);

    await adbLogcat(['-c']);

    const [, args] = mockExeca.mock.calls[0];
    expect(args).toEqual(['logcat', '-c']);
  });

  it('listDevices() → stdout 파싱 후 \\tdevice 라인의 serial 목록만 반환', async () => {
    const devicesOutput = [
      'List of devices attached',
      'emulator-5554\tdevice',
      'R5CN803ABCD\tdevice',
      'emulator-5556\toffline',
      '',
    ].join('\n');
    mockExeca.mockResolvedValue({ stdout: devicesOutput } as any);

    const result = await listDevices();

    expect(result).toEqual(['emulator-5554', 'R5CN803ABCD']);
  });

  it('listDevices() — 연결된 기기 없을 때 빈 배열 반환', async () => {
    mockExeca.mockResolvedValue({ stdout: 'List of devices attached\n' } as any);

    const result = await listDevices();

    expect(result).toEqual([]);
  });
});
