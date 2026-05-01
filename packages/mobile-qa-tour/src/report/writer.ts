import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function writeReport(
  outputDir: string,
  filename: string,
  content: string
): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const fullPath = path.join(outputDir, filename);
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}
