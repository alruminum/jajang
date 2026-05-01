export type CrashType = 'FATAL' | 'ANR' | 'CRASH';

export interface Crash {
  type: CrashType;
  excerpt: string;
  lineIndex: number;
}

const PATTERNS: Array<{ regex: RegExp; type: CrashType }> = [
  { regex: /FATAL EXCEPTION/, type: 'FATAL' },
  { regex: /ANR in /, type: 'ANR' },
  { regex: /CRASH:/, type: 'CRASH' },
];

export function extractCrashes(logcatRaw: string): Crash[] {
  const lines = logcatRaw.split('\n');
  const out: Crash[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const { regex, type } of PATTERNS) {
      if (regex.test(lines[i])) {
        const excerpt = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        out.push({ type, excerpt, lineIndex: i });
        break;
      }
    }
  }
  return out;
}
