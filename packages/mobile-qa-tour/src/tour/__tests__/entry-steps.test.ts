import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeStep, executeSteps } from '../entry-steps';
import type { EntryStep, EntryStepCtx } from '../entry-steps';

vi.mock('../../adb');

import { adbShell } from '../../adb';

const mockAdbShell = vi.mocked(adbShell);

const ctx: EntryStepCtx = { appPackage: 'com.x.app' };

beforeEach(() => {
  vi.clearAllMocks();
  mockAdbShell.mockResolvedValue('');
});

describe('REQ-005 executeStep — 7 type adb 호출 매핑', () => {
  it('tap: adbShell("input tap 100 200") 1회 호출', async () => {
    const step: EntryStep = { type: 'tap', x: 100, y: 200 };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledOnce();
    expect(mockAdbShell).toHaveBeenCalledWith('input tap 100 200');
  });

  it('tapTestId: throw — /batch 03/ 메시지 포함', async () => {
    const step: EntryStep = { type: 'tapTestId', testId: 'btn-home' };
    await expect(executeStep(step, ctx)).rejects.toThrow(/batch 03/);
    expect(mockAdbShell).not.toHaveBeenCalled();
  });

  it('keyevent string 코드: adbShell("input keyevent BACK") 1회 호출', async () => {
    const step: EntryStep = { type: 'keyevent', code: 'BACK' };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledWith('input keyevent BACK');
  });

  it('keyevent number 코드: adbShell("input keyevent 4") 1회 호출', async () => {
    const step: EntryStep = { type: 'keyevent', code: 4 };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledWith('input keyevent 4');
  });

  it('permissionGrant: adbShell("pm grant com.x.app android.permission.RECORD_AUDIO") 1회 호출', async () => {
    const step: EntryStep = { type: 'permissionGrant', permission: 'android.permission.RECORD_AUDIO' };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledWith('pm grant com.x.app android.permission.RECORD_AUDIO');
  });

  it('deepLink: am start 명령에 uri 가 single-quote 로 래핑되어 호출', async () => {
    const step: EntryStep = { type: 'deepLink', uri: 'jajang://home' };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledOnce();
    const arg = mockAdbShell.mock.calls[0][0];
    expect(arg).toMatch(/^am start -a android\.intent\.action\.VIEW -d/);
    expect(arg).toContain("'jajang://home'");
    expect(arg).toContain('com.x.app');
  });

  it('wait: adbShell 호출 없이 resolve (ms=50)', async () => {
    vi.useFakeTimers();
    const step: EntryStep = { type: 'wait', ms: 50 };
    const promise = executeStep(step, ctx);
    vi.advanceTimersByTime(50);
    await promise;
    expect(mockAdbShell).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// REQ-006: inputText escape
describe('REQ-006 executeStep inputText — escape 검증', () => {
  it('공백은 %s 로 치환: "hello world" → "input text hello%sworld"', async () => {
    const step: EntryStep = { type: 'inputText', text: 'hello world' };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledWith('input text hello%sworld');
  });

  it('큰따옴표는 escape: \'a"b\' → "input text a\\"b"', async () => {
    const step: EntryStep = { type: 'inputText', text: 'a"b' };
    await executeStep(step, ctx);
    const arg = mockAdbShell.mock.calls[0][0];
    expect(arg).toBe('input text a\\"b');
  });
});

// executeSteps — 순서 보장
describe('executeSteps — 다중 step 순차 실행', () => {
  it('3개 step 배열 → adbShell 3회 순서대로 호출', async () => {
    const steps: EntryStep[] = [
      { type: 'tap', x: 0, y: 0 },
      { type: 'keyevent', code: 'HOME' },
      { type: 'tap', x: 10, y: 20 },
    ];
    await executeSteps(steps, ctx);
    expect(mockAdbShell).toHaveBeenCalledTimes(3);
    expect(mockAdbShell.mock.calls[0][0]).toBe('input tap 0 0');
    expect(mockAdbShell.mock.calls[1][0]).toBe('input keyevent HOME');
    expect(mockAdbShell.mock.calls[2][0]).toBe('input tap 10 20');
  });

  it('빈 배열 입력 시 adbShell 호출 없음', async () => {
    await executeSteps([], ctx);
    expect(mockAdbShell).not.toHaveBeenCalled();
  });
});
