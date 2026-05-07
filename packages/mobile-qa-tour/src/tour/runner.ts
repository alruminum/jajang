import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { adbExecOut, adbShell } from '../adb';
import { executeSteps } from './entry-steps';
import { dumpUi, parseUi, flattenUi } from './uiautomator';
import { runHeuristics } from '../heuristics';
import type { HeuristicResult } from '../heuristics';
import { renderTourScreenReport } from '../report/tour-template';
import { preparePencilSlot } from '../pencil/adapter';
import type { QaConfig } from '../config/schema';

export interface TourOptions {
  config: QaConfig;
  output?: string;
  only?: string;
  skipUiautomator?: boolean;
  skipHeuristics?: boolean;
}

export interface TourScreenResult {
  id: string;
  label?: string;
  screenshotPath: string;
  uiDumpPath?: string;
  heuristics?: HeuristicResult;
  pencilSlot?: string;
}

export interface TourResult {
  screens: TourScreenResult[];
  outputDir: string;
  startedAt: string;
  finishedAt: string;
}

export async function runTour(opts: TourOptions): Promise<TourResult> {
  const startedAt = new Date().toISOString();
  const { config } = opts;

  if (!config.screens || config.screens.length === 0) {
    throw new Error('runTour: config.screens is empty (loadConfig 결과 검증 누락)');
  }

  const screens = opts.only
    ? config.screens.filter((s) => s.id === opts.only)
    : config.screens;

  if (opts.only && screens.length === 0) {
    throw new Error(`runTour: --only "${opts.only}" matched no screen`);
  }

  const baseOutput = opts.output ?? config.outputDir;
  const dateStr = startedAt.slice(0, 10);
  const tourSubdir = path.join(baseOutput, `${dateStr}-tour`);
  await fs.mkdir(tourSubdir, { recursive: true });

  const results: TourScreenResult[] = [];
  for (const screen of screens) {
    await adbShell(`am start -S -n ${config.appPackage}/.MainActivity`);
    await new Promise(r => setTimeout(r, 5000));
    await executeSteps(screen.entrySteps, { appPackage: config.appPackage });
    if (screen.settleMs > 0) {
      await new Promise((r) => setTimeout(r, screen.settleMs));
    }

    const screenshotPath = path.join(tourSubdir, `${screen.id}.png`);
    const png = await adbExecOut('screencap -p');
    await fs.writeFile(screenshotPath, png);

    let uiDumpPath: string | undefined;
    let heuristics: HeuristicResult | undefined;

    if (!opts.skipUiautomator) {
      const xml = await dumpUi();
      uiDumpPath = path.join(tourSubdir, `${screen.id}.xml`);
      await fs.writeFile(uiDumpPath, xml);

      if (!opts.skipHeuristics) {
        const root = await parseUi(xml);
        const flat = flattenUi(root);
        heuristics = runHeuristics(root);
        void flat; // flattenUi used internally by runHeuristics; kept for future direct use
      }
    }

    let pencilSlot: string | undefined;
    if (config.pencil?.enabled) {
      pencilSlot = preparePencilSlot(screen, config.pencil);
    }

    const md = renderTourScreenReport({
      screen: { id: screen.id, label: screen.label },
      screenshotPath: path.relative(tourSubdir, screenshotPath),
      uiDumpPath: uiDumpPath ? path.relative(tourSubdir, uiDumpPath) : undefined,
      heuristics,
      uxFlowAnchor: (config as any).uxFlowAnchor,
      pencilSlot,
      generatedAt: new Date().toISOString(),
    });
    await fs.writeFile(path.join(tourSubdir, `${screen.id}.md`), md);

    results.push({
      id: screen.id,
      label: screen.label,
      screenshotPath,
      uiDumpPath,
      heuristics,
    });
  }

  return {
    screens: results,
    outputDir: tourSubdir,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
