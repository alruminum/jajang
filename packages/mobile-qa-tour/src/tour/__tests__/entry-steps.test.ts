import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeStep, executeSteps } from '../entry-steps';
import type { EntryStep, EntryStepCtx } from '../entry-steps';

vi.mock('../../adb');
// batch 03: tapTestId 가 dumpUi → parseUi → findByResourceId → bbCenter → adbShell 시퀀스 수행
vi.mock('../uiautomator', () => ({
  dumpUi: vi.fn().mockResolvedValue('<hierarchy><node/></hierarchy>'),
  parseUi: vi.fn().mockResolvedValue({ bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, clickable: false, children: [] }),
  findByResourceId: vi.fn(),
  bbCenter: vi.fn().mockReturnValue({ x: 540, y: 960 }),
}));

import { adbShell } from '../../adb';
import { dumpUi, parseUi, findByResourceId, bbCenter } from '../uiautomator';

const mockAdbShell = vi.mocked(adbShell);
const mockDumpUi = vi.mocked(dumpUi);
const mockParseUi = vi.mocked(parseUi);
const mockFindByResourceId = vi.mocked(findByResourceId);
const mockBbCenter = vi.mocked(bbCenter);

const ctx: EntryStepCtx = { appPackage: 'com.x.app' };

const mockRoot = { bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, clickable: false, children: [] };
const mockNode = { bounds: { x1: 400, y1: 900, x2: 680, y2: 1020 }, clickable: true, children: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockAdbShell.mockResolvedValue('');
  mockDumpUi.mockResolvedValue('<hierarchy><node/></hierarchy>');
  mockParseUi.mockResolvedValue(mockRoot as any);
  mockFindByResourceId.mockReturnValue(mockNode as any);
  mockBbCenter.mockReturnValue({ x: 540, y: 960 });
});

describe('REQ-005 executeStep — 7 type adb 호출 매핑', () => {
  it('tap: adbShell("input tap 100 200") 1회 호출', async () => {
    const step: EntryStep = { type: 'tap', x: 100, y: 200 };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledOnce();
    expect(mockAdbShell).toHaveBeenCalledWith('input tap 100 200');
  });

  // tapTestId: batch 03 실 동작 검증 (throw → 실제 시퀀스)
  it('tapTestId: dumpUi → parseUi → findByResourceId → bbCenter → adbShell("input tap x y") 순서', async () => {
    const step: EntryStep = { type: 'tapTestId', testId: 'com.x.app:id/btn_home' };
    await executeStep(step, ctx);
    expect(mockDumpUi).toHaveBeenCalledOnce();
    expect(mockParseUi).toHaveBeenCalledOnce();
    expect(mockFindByResourceId).toHaveBeenCalledWith(expect.anything(), 'com.x.app:id/btn_home');
    expect(mockBbCenter).toHaveBeenCalledOnce();
    expect(mockAdbShell).toHaveBeenCalledWith('input tap 540 960');
  });

  it('tapTestId: adbShell "input tap {x} {y}" 에 bbCenter 좌표 반영', async () => {
    mockBbCenter.mockReturnValue({ x: 200, y: 400 });
    const step: EntryStep = { type: 'tapTestId', testId: 'com.x.app:id/some_btn' };
    await executeStep(step, ctx);
    expect(mockAdbShell).toHaveBeenCalledWith('input tap 200 400');
  });

  it('tapTestId: findByResourceId null → throw /resource-id .* not found/', async () => {
    mockFindByResourceId.mockReturnValue(null);
    const step: EntryStep = { type: 'tapTestId', testId: 'com.x.app:id/missing' };
    const promise = executeStep(step, ctx);
    await expect(promise).rejects.toThrow(/resource-id.*not found/);
  });

  it('tapTestId: findByResourceId null 일 때 adbShell("input tap") 호출 없음', async () => {
    mockFindByResourceId.mockReturnValue(null);
    const step: EntryStep = { type: 'tapTestId', testId: 'com.x.app:id/missing' };
    await expect(executeStep(step, ctx)).rejects.toThrow();
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
