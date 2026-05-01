import { execa } from 'execa';

export interface AdbExecOptions {
  serial?: string;
  timeoutMs?: number;
}

function withSerial(args: string[], serial?: string): string[] {
  return serial ? ['-s', serial, ...args] : args;
}

export async function adbShell(cmd: string, opts: AdbExecOptions = {}): Promise<string> {
  const { stdout } = await execa('adb', withSerial(['shell', cmd], opts.serial), {
    timeout: opts.timeoutMs,
  });
  return stdout;
}

export async function adbExecOut(cmd: string, opts: AdbExecOptions = {}): Promise<Buffer> {
  const { stdout } = await execa('adb', withSerial(['exec-out', cmd], opts.serial), {
    encoding: null,
    timeout: opts.timeoutMs,
  });
  return stdout;
}

export async function adbLogcat(args: string[] = ['-d'], opts: AdbExecOptions = {}): Promise<string> {
  const { stdout } = await execa('adb', withSerial(['logcat', ...args], opts.serial), {
    timeout: opts.timeoutMs,
  });
  return stdout;
}

export async function listDevices(): Promise<string[]> {
  const { stdout } = await execa('adb', ['devices']);
  return stdout
    .split('\n')
    .slice(1)
    .filter((line) => line.includes('\tdevice')) // offline / unauthorized 기기 제외
    .map((line) => line.split('\t')[0])
    .filter((s) => s.length > 0);
}
