import execa = require('execa');
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { listDevices, adbLogcat } from '../adb';
import { extractCrashes } from './crash-detect';
import type { Crash } from './crash-detect';

export interface MonkeyPercentages {
  touch: number;
  motion: number;
  nav: number;
  syskeys: number;
  anyevent: number;
}

export interface MonkeyOptions {
  appPackage: string;
  events: number;
  throttle: number;
  pcts: MonkeyPercentages;
  output: string;
  seed?: number;
  mainActivity?: string;
  launchWaitMs?: number;
}

export interface MonkeyResult {
  appPackage: string;
  events: number;
  durationMs: number;
  monkeyStdout: string;
  monkeyExitCode: number;
  crashes: Crash[];
  screenshotPath: string | null;
}

export async function runMonkey(opts: MonkeyOptions): Promise<MonkeyResult> {
  const devices = await listDevices();
  if (devices.length === 0) {
    throw new Error('No adb device connected. Run `adb devices` to verify.');
  }

  await fs.mkdir(opts.output, { recursive: true });

  const activity = opts.mainActivity ?? '.MainActivity';
  await execa('adb', ['shell', 'am', 'start', '-S', '-n', `${opts.appPackage}/${activity}`]);
  await new Promise(r => setTimeout(r, opts.launchWaitMs ?? 2000));

  await execa('adb', ['logcat', '-c']);

  const t0 = Date.now();
  const args: string[] = [
    'shell', 'monkey',
    '-p', opts.appPackage,
    '--throttle', String(opts.throttle),
    '--pct-touch', String(opts.pcts.touch),
    '--pct-motion', String(opts.pcts.motion),
    '--pct-nav', String(opts.pcts.nav),
    '--pct-syskeys', String(opts.pcts.syskeys),
    '--pct-anyevent', String(opts.pcts.anyevent),
    '-v', String(opts.events),
  ];

  if (opts.seed != null) {
    args.splice(2, 0, '-s', String(opts.seed));
  }

  const monkey: execa.ExecaReturnValue<string> = await execa('adb', args, { reject: false });
  const durationMs = Date.now() - t0;

  const logcat = await adbLogcat(['-d']);
  const crashes: Crash[] = extractCrashes(logcat);

  let screenshotPath: string | null = null;
  try {
    const { stdout: pngRaw } = await execa('adb', ['exec-out', 'screencap', '-p'], {
      encoding: null,
    });
    screenshotPath = path.join(opts.output, 'last-screen.png');
    await fs.writeFile(screenshotPath, pngRaw);
  } catch (err) {
    console.warn('screencap failed:', (err as Error).message);
    screenshotPath = null;
  }

  return {
    appPackage: opts.appPackage,
    events: opts.events,
    durationMs,
    monkeyStdout: monkey.stdout ?? '',
    monkeyExitCode: monkey.exitCode ?? -1,
    crashes,
    screenshotPath,
  };
}
