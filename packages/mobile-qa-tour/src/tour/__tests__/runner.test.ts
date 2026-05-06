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
// batch 03 신규 mock
vi.mock('../uiautomator', () => ({
  dumpUi: vi.fn().mockResolvedValue('<hierarchy><node/></hierarchy>'),
  parseUi: vi.fn().mockResolvedValue({ bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, clickable: false, children: [] }),
  flattenUi: vi.fn().mockReturnValue([]),
}));
vi.mock('../../heuristics', () => ({
  runHeuristics: vi.fn().mockReturnValue({ textTruncations: [], smallTouchTargets: [] }),
}));
vi.mock('../../report/tour-template', () => ({
  renderTourScreenReport: vi.fn().mockReturnValue('# QA Tour mock'),
}));
// impl/05 — pencil adapter mock
vi.mock('../../pencil/adapter', () => ({
  preparePencilSlot: vi.fn().mockReturnValue('<!-- pencil ref slot mock -->'),
}));

import { executeSteps } from '../entry-steps';
import { adbExecOut } from '../../adb';
import * as fsp from 'node:fs/promises';
import { dumpUi, parseUi, flattenUi } from '../uiautomator';
import { runHeuristics } from '../../heuristics';
import { renderTourScreenReport } from '../../report/tour-template';
import { preparePencilSlot } from '../../pencil/adapter';

const mockExecuteSteps = vi.mocked(executeSteps);
const mockAdbExecOut = vi.mocked(adbExecOut);
const mockMkdir = vi.mocked(fsp.mkdir);
const mockWriteFile = vi.mocked(fsp.writeFile);
const mockDumpUi = vi.mocked(dumpUi);
const mockParseUi = vi.mocked(parseUi);
const mockFlattenUi = vi.mocked(flattenUi);
const mockRunHeuristics = vi.mocked(runHeuristics);
const mockRenderTourScreenReport = vi.mocked(renderTourScreenReport);
const mockPreparePencilSlot = vi.mocked(preparePencilSlot);

function makeConfig(screens: QaConfig['screens'], pencil?: QaConfig['pencil']): QaConfig {
  return {
    appPackage: 'com.test.app',
    outputDir: '/qa-output',
    screens,
    ...(pencil !== undefined ? { pencil } : {}),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecuteSteps.mockResolvedValue(undefined);
  mockAdbExecOut.mockResolvedValue(Buffer.from('PNG_DATA'));
  mockMkdir.mockResolvedValue(undefined);
  mockWriteFile.mockResolvedValue(undefined);
  mockDumpUi.mockResolvedValue('<hierarchy><node/></hierarchy>');
  mockParseUi.mockResolvedValue({ bounds: { x1: 0, y1: 0, x2: 1080, y2: 1920 }, clickable: false, children: [] });
  mockFlattenUi.mockReturnValue([]);
  mockRunHeuristics.mockReturnValue({ textTruncations: [], smallTouchTargets: [] });
  mockRenderTourScreenReport.mockReturnValue('# QA Tour mock');
  mockPreparePencilSlot.mockReturnValue('<!-- pencil ref slot mock -->');
});

// ─── 기존 9 테스트 (유지) ────────────────────────────────────────────────

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

  it('2개 화면 config — fs.writeFile 최소 2회 호출 (screenshot 저장)', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Detail', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    // batch 03: screenshot + xml + md → 화면당 최대 3 writeFile. 최소 2회 보장.
    expect(mockWriteFile.mock.calls.length).toBeGreaterThanOrEqual(2);
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

// ─── REQ-002: batch 03 신규 — uiautomator 통합 ─────────────────────────

describe('REQ-002 runTour — skipUiautomator=false 시 dumpUi 통합', () => {
  it('skipUiautomator 미설정(default) → dumpUi 화면 수만큼 호출', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Settings', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    expect(mockDumpUi).toHaveBeenCalledTimes(2);
  });

  it('skipUiautomator=false → dumpUi 1회 호출 (1 화면)', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: false });
    expect(mockDumpUi).toHaveBeenCalledTimes(1);
  });

  it('skipUiautomator=false → xml writeFile 호출 — 경로가 <id>.xml 형식', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: false });
    const xmlCall = mockWriteFile.mock.calls.find(([p]) => String(p).endsWith('Home.xml'));
    expect(xmlCall).toBeDefined();
  });

  it('skipUiautomator=false → parseUi 호출됨', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: false });
    expect(mockParseUi).toHaveBeenCalledTimes(1);
  });

  it('skipUiautomator=false → runHeuristics 호출됨', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: false });
    expect(mockRunHeuristics).toHaveBeenCalledTimes(1);
  });

  it('skipUiautomator=false → TourScreenResult.uiDumpPath 가 설정됨', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    const result = await runTour({ config, skipUiautomator: false });
    expect(result.screens[0].uiDumpPath).toBeDefined();
    expect(result.screens[0].uiDumpPath).toMatch(/Home\.xml$/);
  });
});

describe('REQ-002 runTour — skipUiautomator=true 시 dump 호출 없음', () => {
  it('skipUiautomator=true → dumpUi 호출 0회', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: true });
    expect(mockDumpUi).not.toHaveBeenCalled();
  });

  it('skipUiautomator=true → parseUi 호출 0회', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: true });
    expect(mockParseUi).not.toHaveBeenCalled();
  });

  it('skipUiautomator=true → TourScreenResult.uiDumpPath === undefined', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    const result = await runTour({ config, skipUiautomator: true });
    expect(result.screens[0].uiDumpPath).toBeUndefined();
  });
});

describe('REQ-002 runTour — skipHeuristics=true 시 heuristics 미산출', () => {
  it('skipHeuristics=true (skipUiautomator=false) → dumpUi 호출되지만 runHeuristics 미호출', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config, skipUiautomator: false, skipHeuristics: true });
    expect(mockDumpUi).toHaveBeenCalledTimes(1);
    expect(mockRunHeuristics).not.toHaveBeenCalled();
  });

  it('skipHeuristics=true → TourScreenResult.heuristics === undefined', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    const result = await runTour({ config, skipUiautomator: false, skipHeuristics: true });
    expect(result.screens[0].heuristics).toBeUndefined();
  });
});

describe('REQ-002 runTour — per-screen .md 파일 writeFile 호출', () => {
  it('1 화면 → renderTourScreenReport 1회 호출', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    expect(mockRenderTourScreenReport).toHaveBeenCalledTimes(1);
  });

  it('1 화면 → <id>.md 경로로 writeFile 호출', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    const mdCall = mockWriteFile.mock.calls.find(([p]) => String(p).endsWith('Home.md'));
    expect(mdCall).toBeDefined();
  });

  it('.md 파일 내용이 renderTourScreenReport 반환값과 일치', async () => {
    mockRenderTourScreenReport.mockReturnValue('# QA Tour — Home');
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    const mdCall = mockWriteFile.mock.calls.find(([p]) => String(p).endsWith('Home.md'));
    expect(mdCall?.[1]).toBe('# QA Tour — Home');
  });

  it('2 화면 → renderTourScreenReport 2회 호출', async () => {
    const config = makeConfig([
      { id: 'Home', entrySteps: [], settleMs: 0 },
      { id: 'Detail', entrySteps: [], settleMs: 0 },
    ]);
    await runTour({ config });
    expect(mockRenderTourScreenReport).toHaveBeenCalledTimes(2);
  });
});

// ─── REQ-PENCIL-08: impl/05 runner — pencil.enabled 분기 ────────────────────
//
// TDD 상태: RED. runner.ts 에 pencil.enabled 분기 미구현 상태.
// engineer 가 impl/05 산출 후 GREEN 전환.

describe('REQ-PENCIL-08 runTour — pencil.enabled=true 분기', () => {
  it('config.pencil.enabled=true 이면 preparePencilSlot 화면 수만큼 호출', async () => {
    const config = makeConfig(
      [
        { id: 'S10', entrySteps: [], settleMs: 0 },
        { id: 'S06', entrySteps: [], settleMs: 0 },
      ],
      { enabled: true, documentPath: '../../design/jajang.pen', nodeIds: { S10: ['llTp1'] } },
    );
    await runTour({ config });
    expect(mockPreparePencilSlot).toHaveBeenCalledTimes(2);
  });

  it('config.pencil.enabled=true 이면 renderTourScreenReport 에 pencilSlot 이 주입됨', async () => {
    mockPreparePencilSlot.mockReturnValue('<!-- pencil ref slot stub -->');
    const config = makeConfig(
      [{ id: 'S10', entrySteps: [], settleMs: 0 }],
      { enabled: true, documentPath: '../../design/jajang.pen', nodeIds: { S10: ['llTp1'] } },
    );
    await runTour({ config });
    const callArg = mockRenderTourScreenReport.mock.calls[0]?.[0];
    expect(callArg?.pencilSlot).toBe('<!-- pencil ref slot stub -->');
  });
});

describe('REQ-PENCIL-09 runTour — pencil.enabled=false 또는 pencil 블록 없음', () => {
  it('config.pencil.enabled=false 이면 preparePencilSlot 미호출', async () => {
    const config = makeConfig(
      [{ id: 'Home', entrySteps: [], settleMs: 0 }],
      { enabled: false },
    );
    await runTour({ config });
    expect(mockPreparePencilSlot).not.toHaveBeenCalled();
  });

  it('config.pencil 블록 자체 없으면 preparePencilSlot 미호출', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    expect(mockPreparePencilSlot).not.toHaveBeenCalled();
  });

  it('pencil 미설정 시 renderTourScreenReport 의 pencilSlot 이 undefined', async () => {
    const config = makeConfig([{ id: 'Home', entrySteps: [], settleMs: 0 }]);
    await runTour({ config });
    const callArg = mockRenderTourScreenReport.mock.calls[0]?.[0];
    expect(callArg?.pencilSlot).toBeUndefined();
  });
});
