import type { Crash } from '../monkey/crash-detect';

export interface MonkeyReportData {
  appPackage: string;
  events: number;
  durationMs: number;
  crashes: Crash[];
  screenshotPath: string | null;
  generatedAt: string;
  seed?: number;
}

export function renderMonkeyReport(data: MonkeyReportData): string {
  const lines: string[] = [];
  lines.push(`# Monkey Report — ${data.appPackage}`);
  lines.push('');
  lines.push(`- Generated: ${data.generatedAt}`);
  lines.push(`- Events: ${data.events}`);
  lines.push(`- Duration: ${data.durationMs} ms`);
  lines.push(`- Seed: ${data.seed ?? 'random'}`);
  lines.push(`- Crashes: ${data.crashes.length}`);
  lines.push('');
  lines.push('## Crashes');
  lines.push('');
  if (data.crashes.length === 0) {
    lines.push('No crashes detected. \u2705');
  } else {
    for (const c of data.crashes) {
      lines.push(`### ${c.type} (line ${c.lineIndex})`);
      lines.push('');
      lines.push('```');
      lines.push(c.excerpt);
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('');
  lines.push('## Last Screenshot');
  lines.push('');
  if (data.screenshotPath) {
    lines.push(`![last-screen](${data.screenshotPath})`);
  } else {
    lines.push('_screenshot capture failed_');
  }
  return lines.join('\n');
}
