import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, ConfigLoadError } from '../load';

vi.mock('node:fs/promises');

import * as fsp from 'node:fs/promises';

const mockReadFile = vi.mocked(fsp.readFile as (path: string, enc: string) => Promise<string>);

const VALID_CONFIG_JSON = JSON.stringify({
  appPackage: 'com.example.app',
  screens: [{ id: 'Home', entrySteps: [] }],
});

const VALID_REGISTRY_JSON = JSON.stringify([
  { id: 'Home', entrySteps: [] },
]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('REQ-003 loadConfig — 4 분기', () => {
  it('ENOENT 시 ConfigLoadError — /config not found/ 메시지', async () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValueOnce(err);

    await expect(loadConfig('/no/path/config.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/no/path/config.json')).rejects.toThrow(/config not found/);
  });

  it('invalid JSON 시 ConfigLoadError — /invalid JSON/ 메시지', async () => {
    mockReadFile.mockResolvedValueOnce('{');

    await expect(loadConfig('/cfg.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/cfg.json')).rejects.toThrow(/invalid JSON/);
  });

  it('zod validation fail 시 ConfigLoadError — /config validation failed/ 메시지', async () => {
    // appPackage 누락 + screens 없음 → zod fail
    mockReadFile.mockResolvedValueOnce(JSON.stringify({}));

    await expect(loadConfig('/cfg.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/cfg.json')).rejects.toThrow(/config validation failed/);
  });

  it('valid config 파일 시 QaConfig 반환', async () => {
    mockReadFile.mockResolvedValueOnce(VALID_CONFIG_JSON);

    const config = await loadConfig('/cfg.json');
    expect(config.appPackage).toBe('com.example.app');
    expect(config.screens).toHaveLength(1);
  });
});

describe('REQ-004 loadConfig — screenRegistryPath 머지', () => {
  it('screenRegistryPath 존재 시 registry 파일을 읽어 config.screens 로 덮어씀', async () => {
    const configWithRegistry = JSON.stringify({
      appPackage: 'com.example.app',
      screenRegistryPath: './registry.json',
    });
    const registryJson = JSON.stringify([
      { id: 'Home', entrySteps: [] },
      { id: 'Settings', entrySteps: [{ type: 'tap', x: 100, y: 200 }] },
    ]);

    // 첫 번째 readFile: config, 두 번째: registry
    mockReadFile
      .mockResolvedValueOnce(configWithRegistry)
      .mockResolvedValueOnce(registryJson);

    const config = await loadConfig('/dir/cfg.json');
    expect(config.screens).toHaveLength(2);
    expect(config.screens![0].id).toBe('Home');
    expect(config.screens![1].id).toBe('Settings');
  });

  it('screenRegistryPath 가 ENOENT 시 ConfigLoadError — /screenRegistry not found/ 메시지', async () => {
    const configWithRegistry = JSON.stringify({
      appPackage: 'com.example.app',
      screenRegistryPath: './missing-registry.json',
    });
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });

    mockReadFile
      .mockResolvedValueOnce(configWithRegistry)
      .mockRejectedValueOnce(err);

    await expect(loadConfig('/dir/cfg.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/dir/cfg.json')).rejects.toThrow(/screenRegistry not found/);
  });

  it('screenRegistryPath 파일이 유효하지 않은 JSON 시 ConfigLoadError — /invalid JSON/ 메시지', async () => {
    const configWithRegistry = JSON.stringify({
      appPackage: 'com.example.app',
      screenRegistryPath: './registry.json',
    });

    mockReadFile
      .mockResolvedValueOnce(configWithRegistry)
      .mockResolvedValueOnce('{bad json');

    await expect(loadConfig('/dir/cfg.json')).rejects.toThrow(ConfigLoadError);
    await expect(loadConfig('/dir/cfg.json')).rejects.toThrow(/invalid JSON/);
  });
});
