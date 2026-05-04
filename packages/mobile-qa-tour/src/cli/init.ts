import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface InitOptions {
  outDir: string;
  force?: boolean;
}

export interface InitResult {
  copied: string[];
  skipped: string[];
}

const TEMPLATE_FILES = [
  'qa.config.example.json',
  'screen-registry.example.json',
];

function templatesDir(): string {
  return path.resolve(__dirname, '..', '..', 'templates');
}

export async function runInit(opts: InitOptions): Promise<InitResult> {
  await fs.mkdir(opts.outDir, { recursive: true });
  const copied: string[] = [];
  const skipped: string[] = [];

  for (const name of TEMPLATE_FILES) {
    const src = path.join(templatesDir(), name);
    const dst = path.join(opts.outDir, name);
    try {
      await fs.stat(dst);
      skipped.push(dst);
      continue;
    } catch {
      // not exist → copy
    }
    await fs.copyFile(src, dst);
    copied.push(dst);
  }

  return { copied, skipped };
}
