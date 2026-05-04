import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { QaConfigSchema, ScreenSchema, type QaConfig } from './schema';

export class ConfigLoadError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConfigLoadError';
    this.cause = cause;
  }
}

export async function loadConfig(configPath: string): Promise<QaConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (e: any) {
    if (e?.code === 'ENOENT') throw new ConfigLoadError(`config not found: ${configPath}`);
    throw new ConfigLoadError(`failed to read config: ${configPath}`, e);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw new ConfigLoadError(`invalid JSON: ${configPath} — ${e?.message ?? 'parse error'}`, e);
  }

  const result = QaConfigSchema.safeParse(parsed);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`,
    );
    throw new ConfigLoadError(`config validation failed:\n${lines.join('\n')}`);
  }
  const config = result.data;

  if (config.screenRegistryPath) {
    const registryPath = path.resolve(path.dirname(configPath), config.screenRegistryPath);
    let registryRaw: string;
    try {
      registryRaw = await fs.readFile(registryPath, 'utf8');
    } catch (e: any) {
      if (e?.code === 'ENOENT') throw new ConfigLoadError(`screenRegistry not found: ${registryPath}`, e);
      throw new ConfigLoadError(`failed to read screenRegistry: ${registryPath}`, e);
    }
    let registryParsed: unknown;
    try {
      registryParsed = JSON.parse(registryRaw);
    } catch (e: any) {
      throw new ConfigLoadError(`invalid JSON: ${registryPath} — ${e?.message ?? 'parse error'}`, e);
    }
    const screens = z.array(ScreenSchema).safeParse(registryParsed);
    if (!screens.success) {
      const lines = screens.error.issues.map(
        (i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`,
      );
      throw new ConfigLoadError(`screenRegistry validation failed:\n${lines.join('\n')}`);
    }
    config.screens = screens.data;
  }

  return config;
}
